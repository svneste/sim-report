import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { leadStatusTransitions } from '../../db/schema.js'
import { amocrm } from '../amocrm/client.js'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'

/**
 * Тащит из amoCRM `lead_status_changed` events и складывает их
 * в таблицу lead_status_transitions. Нужно для графика "включения
 * по дате перехода" — в самой сделке amoCRM нет даты перехода
 * на этап, есть только текущий status_id.
 *
 * Дедупликация естественная: PK таблицы — id события из amoCRM,
 * повторный sync того же окна делает onConflictDoNothing.
 */

const BACKFILL_DAYS = 90
const PAGE_SAFETY_LIMIT = 5000 // защита от бесконечной пагинации, ~50 страниц по 100

export interface StatusEventsSyncResult {
  inserted: number
  scanned:  number
  fromSec:  number
  toSec:    number
}

let lastEventSyncAtSec: number | null = null

/**
 * Возвращает unix-секунды первой ещё не заситнканной точки.
 * При первом вызове — `now - BACKFILL_DAYS`, дальше — последний sync минус
 * 5 минут перекрытия, чтобы не пропустить события на границе окна.
 */
function nextWindowFromSec(): number {
  if (lastEventSyncAtSec == null) {
    return Math.floor(Date.now() / 1000) - BACKFILL_DAYS * 86400
  }
  return lastEventSyncAtSec - 300
}

export async function syncStatusEvents(): Promise<StatusEventsSyncResult> {
  const fromSec = nextWindowFromSec()
  const toSec   = Math.floor(Date.now() / 1000)
  logger.info('status-events sync started', {
    fromSec, toSec, backfill: lastEventSyncAtSec == null,
  })

  let scanned  = 0
  let inserted = 0
  const buffer: typeof leadStatusTransitions.$inferInsert[] = []

  const flush = async () => {
    if (!buffer.length) return
    const res = await db.insert(leadStatusTransitions)
      .values(buffer)
      .onConflictDoNothing({ target: leadStatusTransitions.id })
    // postgres-js драйвер для drizzle отдаёт затронутые строки в `count`
    const c = (res as unknown as { count?: number }).count ?? 0
    inserted += c
    buffer.length = 0
  }

  for await (const ev of amocrm.leadStatusChangedEvents(fromSec, toSec)) {
    scanned++
    if (scanned > PAGE_SAFETY_LIMIT) {
      logger.warn('status-events sync hit safety limit', { scanned })
      break
    }

    // Нас интересует только наша воронка. Бывает, что value_after массив
    // или объект — приводим к массиву и берём первый элемент.
    const after = Array.isArray(ev.value_after) ? ev.value_after[0] : ev.value_after
    const newStatus = after?.lead_status
    if (!newStatus) continue
    if (newStatus.pipeline_id !== config.AMOCRM_PIPELINE_ID) continue

    buffer.push({
      id:         String(ev.id),
      dealId:     Number(ev.entity_id),
      statusId:   Number(newStatus.id),
      pipelineId: Number(newStatus.pipeline_id),
      occurredAt: new Date(ev.created_at * 1000),
      syncedAt:   new Date(),
    })

    if (buffer.length >= 500) await flush()
  }
  await flush()

  lastEventSyncAtSec = toSec
  logger.info('status-events sync finished', { scanned, inserted, fromSec, toSec })
  return { inserted, scanned, fromSec, toSec }
}

/**
 * Сбрасывает watermark — следующий вызов syncStatusEvents сделает
 * полный backfill за последние BACKFILL_DAYS дней. Используется
 * ручкой /api/sync/status-events/backfill для пересборки истории.
 */
export function resetStatusEventsWatermark(): void {
  lastEventSyncAtSec = null
}
