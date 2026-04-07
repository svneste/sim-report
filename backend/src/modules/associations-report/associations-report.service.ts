import { eq, notInArray, sql } from 'drizzle-orm'
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
  /** Сколько всего оформлений у объединения за всё время */
  lifetimeTotal: number
  /** Среднее количество оформлений в день (на активные дни, 1 знак после запятой) */
  lifetimeAvgPerDay: number
  /** Среднее количество оформлений в месяц (на активные месяцы, 1 знак после запятой) */
  lifetimeAvgPerMonth: number
}

export interface AssociationOption {
  name:  string
  total: number
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
  /** Полный список названий объединений за месяц для фильтра (имя + total) */
  allOptions:  AssociationOption[]
}

function monthBounds(year: number, month: number) {
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

interface MonthlyAgg {
  total:  number
  counts: Record<number, number>
}

interface LifetimeAgg {
  total: number
  /** Множество уникальных дат (YYYY-MM-DD), в которые были оформления */
  days:   Set<string>
  /** Множество уникальных месяцев (YYYY-MM) — для расчёта ср/месяц */
  months: Set<string>
}

export const associationsReportService = {
  /**
   * Возвращает помесячный отчёт по объединениям с пагинацией.
   * Сортировка — по убыванию суммы оформлений за месяц.
   *
   * Внутри делается ОДИН проход по всем sim-регистрациям: считаем
   * и месячные срезы, и lifetime-статистику (всего за всё время + ср/день).
   */
  async getMonthly(
    year: number,
    month: number,
    limit: number,
    offset: number,
    selected: string[] = [],
  ): Promise<AssociationsReportPayload> {
    const excluded = config.reportExcludedUserIds
    const { from, to } = monthBounds(year, month)

    // Тянем ВСЕ sim-регистрации (не только месяц), потому что нужен
    // lifetime для каждой строки. Для текущих объёмов это нормально;
    // если станет больно — оптимизируем через материализованную view.
    const dbRows = await db
      .select({
        date: simRegistrations.registeredOn,
        raw:  amocrmDeals.raw,
      })
      .from(simRegistrations)
      .innerJoin(amocrmDeals, eq(amocrmDeals.id, simRegistrations.dealId))
      .where(excluded.length
        ? notInArray(simRegistrations.responsibleUserId, excluded)
        : sql`true`)

    const monthly  = new Map<string, MonthlyAgg>()
    const lifetime = new Map<string, LifetimeAgg>()
    let grandTotal = 0

    for (const r of dbRows) {
      const assoc = extractAssociation(r.raw)
      const date  = String(r.date)

      // Lifetime — копим всегда
      let lt = lifetime.get(assoc)
      if (!lt) {
        lt = { total: 0, days: new Set<string>(), months: new Set<string>() }
        lifetime.set(assoc, lt)
      }
      lt.total += 1
      lt.days.add(date)
      lt.months.add(date.slice(0, 7))

      // Месячное — только если попадает в окно
      if (date >= from && date <= to) {
        const day = Number(date.slice(8, 10))
        let m = monthly.get(assoc)
        if (!m) {
          m = { total: 0, counts: {} }
          monthly.set(assoc, m)
        }
        m.total += 1
        m.counts[day] = (m.counts[day] ?? 0) + 1
        grandTotal += 1
      }
    }

    // Собираем строки только для тех, кто появился в текущем месяце
    const enriched: AssociationRow[] = Array.from(monthly.entries()).map(([assoc, m]) => {
      const lt = lifetime.get(assoc)
      const lifetimeTotal = lt?.total ?? 0
      const activeDays    = lt?.days.size ?? 0
      const activeMonths  = lt?.months.size ?? 0
      const lifetimeAvgPerDay = activeDays > 0
        ? Math.round((lifetimeTotal / activeDays) * 10) / 10
        : 0
      const lifetimeAvgPerMonth = activeMonths > 0
        ? Math.round((lifetimeTotal / activeMonths) * 10) / 10
        : 0
      return {
        association:       assoc,
        total:             m.total,
        counts:            m.counts,
        lifetimeTotal,
        lifetimeAvgPerDay,
        lifetimeAvgPerMonth,
      }
    })

    enriched.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.association.localeCompare(b.association, 'ru')
    })

    const allOptions: AssociationOption[] = enriched.map(r => ({
      name:  r.association,
      total: r.total,
    }))

    let rows: AssociationRow[]
    let hasMore: boolean
    let totalGroups: number

    if (selected.length) {
      const set = new Set(selected)
      rows = enriched.filter(r => set.has(r.association))
      totalGroups = rows.length
      hasMore = false
    } else {
      rows = enriched.slice(offset, offset + limit)
      totalGroups = enriched.length
      hasMore = offset + rows.length < enriched.length
    }

    return {
      year,
      month,
      totalGroups,
      grandTotal,
      rows,
      hasMore,
      allOptions,
    }
  },
}
