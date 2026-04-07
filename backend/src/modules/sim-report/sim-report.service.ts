import { and, asc, between, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmDeals, amocrmUsers, simRegistrations } from '../../db/schema.js'
import { config } from '../../core/config.js'

/**
 * ID custom-поля "Объединение" в amoCRM. Захардкожен здесь, потому что
 * это часть домена отчёта, а не общая настройка интеграции.
 * Если у поля поменяется ID — меняем тут.
 */
const ASSOCIATION_FIELD_ID = 539431

export interface SimReportUser {
  id:     number
  name:   string
  email:  string | null
  avatar: string | null
}

export interface SimReportEntry {
  userId: number
  date:   string // YYYY-MM-DD
  count:  number
}

export interface SimReportPayload {
  year:    number
  month:   number // 1..12
  users:   SimReportUser[]
  entries: SimReportEntry[]
  /** Суммы по дням текущего месяца, индексация: day(1..N) → count */
  dayTotals: Record<number, number>
  /** Суммы по дням предыдущего месяца — для сравнительной линии на графике */
  prevMonthDayTotals: Record<number, number>
  /** Метаданные предыдущего месяца, чтобы фронт мог подписать ось */
  prevMonth: { year: number; month: number; daysInMonth: number }
}

export interface SimReportDeal {
  id:          number
  name:        string | null
  association: string | null
  url:         string
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  // последний день месяца
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

/**
 * Считает кол-во оформлений по дням за указанный месяц без разбивки по юзерам.
 * Используется для построения графика (например, сравнение с прошлым месяцем).
 */
async function fetchDailyTotals(
  year: number,
  month: number,
  excludedUserIds: number[],
): Promise<Record<number, number>> {
  const { from, to } = monthRange(year, month)
  const dateFilter = between(simRegistrations.registeredOn, from, to)
  const where = excludedUserIds.length
    ? and(dateFilter, notInArray(simRegistrations.responsibleUserId, excludedUserIds))
    : dateFilter

  const rows = await db
    .select({
      date:  simRegistrations.registeredOn,
      count: sql<number>`count(*)::int`,
    })
    .from(simRegistrations)
    .where(where)
    .groupBy(simRegistrations.registeredOn)

  const out: Record<number, number> = {}
  for (const r of rows) {
    const day = Number(String(r.date).slice(8, 10))
    out[day] = (out[day] ?? 0) + Number(r.count)
  }
  return out
}

export const simReportService = {
  /**
   * Возвращает данные для построения календаря: список сотрудников + агрегаты по дням.
   * Доменный модуль не знает про amoCRM API — читает из локальной БД.
   */
  async getMonthly(year: number, month: number): Promise<SimReportPayload> {
    const { from, to } = monthRange(year, month)

    const excluded = config.reportExcludedUserIds
    const dateFilter = between(simRegistrations.registeredOn, from, to)
    const whereClause = excluded.length
      ? and(dateFilter, notInArray(simRegistrations.responsibleUserId, excluded))
      : dateFilter

    const rows = await db
      .select({
        userId: simRegistrations.responsibleUserId,
        date:   simRegistrations.registeredOn,
        count:  sql<number>`count(*)::int`,
      })
      .from(simRegistrations)
      .where(whereClause)
      .groupBy(simRegistrations.responsibleUserId, simRegistrations.registeredOn)
      .orderBy(asc(simRegistrations.registeredOn))

    const entries: SimReportEntry[] = rows.map(r => ({
      userId: Number(r.userId),
      date:   String(r.date),
      count:  Number(r.count),
    }))

    const userIds = Array.from(new Set(entries.map(e => e.userId)))
    const usersData = userIds.length
      ? await db.select().from(amocrmUsers).where(inArray(amocrmUsers.id, userIds))
      : []

    const users: SimReportUser[] = usersData
      .map(u => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    // Агрегаты по дням текущего месяца — берём прямо из entries, чтобы не делать ещё один запрос
    const dayTotals: Record<number, number> = {}
    for (const e of entries) {
      const day = Number(e.date.slice(8, 10))
      dayTotals[day] = (dayTotals[day] ?? 0) + e.count
    }

    // Агрегаты по дням предыдущего месяца — отдельный запрос, без разбивки по юзерам
    const prevYear  = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate()
    const prevMonthDayTotals = await fetchDailyTotals(prevYear, prevMonth, excluded)

    return {
      year,
      month,
      users,
      entries,
      dayTotals,
      prevMonthDayTotals,
      prevMonth: { year: prevYear, month: prevMonth, daysInMonth: prevDaysInMonth },
    }
  },

  /**
   * Возвращает список сделок, оформленных конкретным сотрудником в указанный день.
   * Используется для всплывающего окна при клике на цифру в календаре.
   */
  async getDealsForCell(userId: number, date: string): Promise<SimReportDeal[]> {
    const rows = await db
      .select({
        id:   amocrmDeals.id,
        name: amocrmDeals.name,
        raw:  amocrmDeals.raw,
      })
      .from(simRegistrations)
      .innerJoin(amocrmDeals, eq(amocrmDeals.id, simRegistrations.dealId))
      .where(
        and(
          eq(simRegistrations.responsibleUserId, userId),
          eq(simRegistrations.registeredOn, date),
        ),
      )
      .orderBy(asc(amocrmDeals.id))

    const baseUrl = `https://${config.AMOCRM_SUBDOMAIN}.amocrm.ru/leads/detail/`

    return rows.map(r => ({
      id:          Number(r.id),
      name:        r.name,
      association: extractAssociation(r.raw),
      url:         `${baseUrl}${r.id}`,
    }))
  },
}

/**
 * Достаёт значение custom-поля "Объединение" из сырого payload сделки.
 * Поле может быть text/select/multi-select — приводим к строке.
 */
function extractAssociation(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const fields = (raw as { custom_fields_values?: Array<{ field_id: number; values?: Array<{ value: unknown }> }> | null }).custom_fields_values
  if (!fields) return null
  const f = fields.find(x => x.field_id === ASSOCIATION_FIELD_ID)
  if (!f || !f.values || !f.values.length) return null
  const parts = f.values
    .map(v => (v.value == null ? '' : String(v.value)))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

void sql; void inArray
