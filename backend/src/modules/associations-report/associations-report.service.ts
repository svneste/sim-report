import { and, between, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmDeals, simRegistrations } from '../../db/schema.js'
import { config } from '../../core/config.js'

/**
 * ID custom-поля "Объединение" в amoCRM. Тот же ID, что и в sim-report —
 * см. extractAssociation в sim-report.service.ts.
 */
const ASSOCIATION_FIELD_ID = 539431

const NO_ASSOCIATION = 'Без объединения'

export interface AssociationRow {
  /** Название объединения (или "Без объединения" для сделок без значения) */
  association: string
  /** Сумма за месяц */
  total: number
  /** Маппинг "день месяца → количество" */
  counts: Record<number, number>
}

export interface AssociationsReportPayload {
  year:        number
  month:       number
  /** Общее число объединений (для расчёта hasMore) */
  totalGroups: number
  /** Общее количество оформлений за месяц по всем объединениям */
  grandTotal:  number
  /** Срез [offset, offset+limit) — отсортирован по total desc */
  rows:        AssociationRow[]
  hasMore:     boolean
}

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

function extractAssociation(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return NO_ASSOCIATION
  const fields = (raw as { custom_fields_values?: Array<{ field_id: number; values?: Array<{ value: unknown }> }> | null }).custom_fields_values
  if (!fields) return NO_ASSOCIATION
  const f = fields.find(x => x.field_id === ASSOCIATION_FIELD_ID)
  if (!f || !f.values || !f.values.length) return NO_ASSOCIATION
  const parts = f.values
    .map(v => (v.value == null ? '' : String(v.value).trim()))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : NO_ASSOCIATION
}

export const associationsReportService = {
  /**
   * Возвращает помесячный отчёт по объединениям с пагинацией.
   * Сортировка — по убыванию суммы оформлений за месяц.
   */
  async getMonthly(
    year: number,
    month: number,
    limit: number,
    offset: number,
  ): Promise<AssociationsReportPayload> {
    const excluded = config.reportExcludedUserIds
    const { from, to } = monthRange(year, month)

    const dateFilter = between(simRegistrations.registeredOn, from, to)
    const where = excluded.length
      ? and(dateFilter, notInArray(simRegistrations.responsibleUserId, excluded))
      : dateFilter

    // Тянем все sim-регистрации месяца с raw сделки.
    // Для текущих объёмов (десятки/сотни в день) это быстрее и проще,
    // чем вытаскивать поле через jsonb-операторы в Postgres.
    const rows = await db
      .select({
        date: simRegistrations.registeredOn,
        raw:  amocrmDeals.raw,
      })
      .from(simRegistrations)
      .innerJoin(amocrmDeals, eq(amocrmDeals.id, simRegistrations.dealId))
      .where(where)

    // Группировка: association → { total, counts[day] }
    const groups = new Map<string, AssociationRow>()
    let grandTotal = 0
    for (const r of rows) {
      const assoc = extractAssociation(r.raw)
      const day   = Number(String(r.date).slice(8, 10))
      let g = groups.get(assoc)
      if (!g) {
        g = { association: assoc, total: 0, counts: {} }
        groups.set(assoc, g)
      }
      g.total += 1
      g.counts[day] = (g.counts[day] ?? 0) + 1
      grandTotal += 1
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.association.localeCompare(b.association, 'ru')
    })

    const slice = sorted.slice(offset, offset + limit)
    return {
      year,
      month,
      totalGroups: sorted.length,
      grandTotal,
      rows:        slice,
      hasMore:     offset + slice.length < sorted.length,
    }
  },
}

void sql
