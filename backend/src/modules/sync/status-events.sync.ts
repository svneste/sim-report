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

  let scanned         = 0
  let inserted        = 0
  let matchedPipeline = 0
  let firstSampleLogged = false
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

    // Логируем первое событие в сыром виде — нужно один раз увидеть
    // фактическую форму value_after от amoCRM, чтобы убедиться, что
    // парсинг ниже совпадает с реальностью.
    if (!firstSampleLogged) {
      logger.info('status-events first raw event', JSON.stringify(ev))
      firstSampleLogged = true
    }

    const newStatus = extractNewStatus(ev)
    if (!newStatus) continue
    if (newStatus.pipeline_id !== config.AMOCRM_PIPELINE_ID) continue
    matchedPipeline++

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
  logger.info('status-events sync finished', {
    scanned, matchedPipeline, inserted, fromSec, toSec,
    pipeline: config.AMOCRM_PIPELINE_ID,
  })
  return { inserted, scanned, fromSec, toSec }
}

/**
 * amoCRM events API в разных версиях возвращает value_after то массивом,
 * то объектом, и сама нагрузка может лежать или в `lead_status`, или
 * в `status` (без префикса). Перебираем все известные варианты, прежде
 * чем сдаваться.
 */
function extractNewStatus(ev: unknown): { id: number; pipeline_id: number } | null {
  const e = ev as { value_after?: unknown }
  const va = e?.value_after
  if (!va) return null
  const list: unknown[] = Array.isArray(va) ? va : [va]
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const candidate =
      (obj.lead_status as { id?: unknown; pipeline_id?: unknown } | undefined) ??
      (obj.status      as { id?: unknown; pipeline_id?: unknown } | undefined)
    if (!candidate) continue
    const id = Number(candidate.id)
    const pid = Number(candidate.pipeline_id)
    if (Number.isFinite(id) && Number.isFinite(pid)) {
      return { id, pipeline_id: pid }
    }
  }
  return null
}

/**
 * Сбрасывает watermark — следующий вызов syncStatusEvents сделает
 * полный backfill за последние BACKFILL_DAYS дней. Используется
 * ручкой /api/sync/status-events/backfill для пересборки истории.
 */
export function resetStatusEventsWatermark(): void {
  lastEventSyncAtSec = null
}
