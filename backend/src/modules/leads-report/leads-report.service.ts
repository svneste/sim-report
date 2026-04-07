import { and, between, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmDeals } from '../../db/schema.js'
import { config } from '../../core/config.js'
import { amocrm } from '../amocrm/client.js'
import { logger } from '../../core/logger.js'

/**
 * Системный статус amoCRM для "закрыто и не реализовано".
 * Это глобальный статус, общий для всех воронок аккаунта.
 */
const LOST_STATUS_ID = 143
const WON_STATUS_ID  = 142

export interface LossReasonRow {
  reasonId:   number | null
  reasonName: string
  count:      number
}

export interface LeadsReportPayload {
  year:  number
  month: number
  /** Имя первой стадии (обычно "Новое обращение") — для подписей в UI */
  newStageName:    string
  newStageId:      number
  /** Всего заявок поступило за месяц (по created_at) */
  total:           number
  /** Сколько из них хоть раз покидали первую стадию (по истории смены статусов) */
  advancedPastNew: number
  /** Сколько ушло в "не реализовано" */
  lostTotal:       number
  /** Разбивка "не реализовано" по причинам */
  lostByReason:    LossReasonRow[]
}

function monthBounds(year: number, month: number) {
  const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const toDate   = new Date(Date.UTC(year, month,     1, 0, 0, 0))
  return { fromDate, toDate }
}

function extractLossReasonId(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const v = (raw as { loss_reason_id?: unknown }).loss_reason_id
  if (typeof v === 'number' && v > 0) return v
  return null
}

export const leadsReportService = {
  async getMonthly(year: number, month: number): Promise<LeadsReportPayload> {
    const pipelineId = config.AMOCRM_PIPELINE_ID

    // 1. Статусы воронки → определяем "Новое обращение" как статус с минимальным sort
    //    среди не-системных (исключаем 142/143).
    const statuses = await amocrm.pipelineStatuses(pipelineId)
    const userStages = statuses
      .filter(s => s.id !== WON_STATUS_ID && s.id !== LOST_STATUS_ID)
      .sort((a, b) => a.sort - b.sort)
    const newStage = userStages[0]
    if (!newStage) {
      throw new Error(`pipeline ${pipelineId} has no user-defined stages`)
    }

    // 2. Справочник причин потери — id → name
    const lossReasons = await amocrm.lossReasons()
    const lossNameById = new Map<number, string>()
    for (const r of lossReasons) lossNameById.set(r.id, r.name)

    // 3. Сделки нашей воронки, созданные в этом месяце.
    const { fromDate, toDate } = monthBounds(year, month)
    const rows = await db
      .select({
        id:       amocrmDeals.id,
        statusId: amocrmDeals.statusId,
        raw:      amocrmDeals.raw,
      })
      .from(amocrmDeals)
      .where(and(
        eq(amocrmDeals.pipelineId, pipelineId),
        between(amocrmDeals.createdAt, fromDate, toDate),
      ))

    const total   = rows.length
    const leadIds = new Set<number>(rows.map(r => Number(r.id)))

    // 4. "Не реализовано" — снимок по текущему статусу.
    const lostRows = rows.filter(r => Number(r.statusId) === LOST_STATUS_ID)
    const lostMap  = new Map<number | null, number>()
    for (const r of lostRows) {
      const reasonId = extractLossReasonId(r.raw)
      lostMap.set(reasonId, (lostMap.get(reasonId) ?? 0) + 1)
    }
    const lostByReason: LossReasonRow[] = Array.from(lostMap.entries())
      .map(([id, count]) => ({
        reasonId:   id,
        reasonName: id == null
          ? 'Без указанной причины'
          : (lossNameById.get(id) ?? `Причина #${id}`),
        count,
      }))
      .sort((a, b) => b.count - a.count)

    // 5. "Продвинулось дальше Новое обращение" — по событиям смены статуса.
    //    Ищем события lead_status_changed, где value_before.lead_status.id = newStage.id
    //    и entity_id входит в наш набор сделок месяца. Окно событий: с начала
    //    месяца по сейчас (заявка может уйти со стадии позже, чем была создана).
    const fromSec = Math.floor(fromDate.getTime() / 1000)
    const toSec   = Math.floor(Date.now() / 1000)

    const advancedIds = new Set<number>()
    let scannedEvents = 0
    try {
      for await (const ev of amocrm.leadStatusChangedEvents(fromSec, toSec)) {
        scannedEvents++
        if (!leadIds.has(ev.entity_id)) continue
        const before = ev.value_before?.[0]?.lead_status
        if (!before) continue
        if (before.pipeline_id !== pipelineId) continue
        if (before.id === newStage.id) {
          advancedIds.add(ev.entity_id)
        }
      }
    } catch (err) {
      logger.error('failed to fetch lead_status_changed events', err)
      // Не валим весь отчёт — отдаём 0 advanced и логируем причину.
    }

    return {
      year,
      month,
      newStageId:      newStage.id,
      newStageName:    newStage.name,
      total,
      advancedPastNew: advancedIds.size,
      lostTotal:       lostRows.length,
      lostByReason,
    }
  },
}

void sql
