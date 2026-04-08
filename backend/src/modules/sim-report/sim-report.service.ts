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
  /** Записи предыдущего месяца с разбивкой по юзерам — нужно для фильтра по сотрудникам */
  prevEntries: SimReportEntry[]
  /** Метаданные предыдущего месяца, чтобы фронт мог подписать ось */
  prevMonth: { year: number; month: number; daysInMonth: number }
}

export interface SimReportDeal {
  id:          number
  name:        string | null
  association: string | null
  url:         string
}

export interface SimReportMonthlyPoint {
  year:  number
  month: number // 1..12
  count: number
}

/**
 * Payload для графика "Поступившие заявки": считает все сделки воронки,
 * созданные в указанный месяц, без фильтра по факту оформления сим-карты.
 * Структура совпадает с SimReportPayload в той части, что нужна графику —
 * это позволяет переиспользовать MonthlyTotalsChart на фронте.
 */
export interface IncomingDealsPayload {
  year:    number
  month:   number
  users:   SimReportUser[]
  entries: SimReportEntry[]
  prevEntries: SimReportEntry[]
  prevMonth: { year: number; month: number; daysInMonth: number }
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  // последний день месяца
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

/**
 * Достаёт оформления за месяц с разбивкой по сотруднику и дню.
 * Базовый запрос для отчётов — на нём строится и таблица, и график, и фильтры.
 */
async function fetchEntriesByUserDay(
  year: number,
  month: number,
  excludedUserIds: number[],
): Promise<SimReportEntry[]> {
  const { from, to } = monthRange(year, month)
  const dateFilter = between(simRegistrations.registeredOn, from, to)
  const where = excludedUserIds.length
    ? and(dateFilter, notInArray(simRegistrations.responsibleUserId, excludedUserIds))
    : dateFilter

  const rows = await db
    .select({
      userId: simRegistrations.responsibleUserId,
      date:   simRegistrations.registeredOn,
      count:  sql<number>`count(*)::int`,
    })
    .from(simRegistrations)
    .where(where)
    .groupBy(simRegistrations.responsibleUserId, simRegistrations.registeredOn)
    .orderBy(asc(simRegistrations.registeredOn))

  return rows.map(r => ({
    userId: Number(r.userId),
    date:   String(r.date),
    count:  Number(r.count),
  }))
}

function sumByDay(entries: SimReportEntry[]): Record<number, number> {
  const out: Record<number, number> = {}
  for (const e of entries) {
    const day = Number(e.date.slice(8, 10))
    out[day] = (out[day] ?? 0) + e.count
  }
  return out
}

export const simReportService = {
  /**
   * Возвращает данные для построения календаря: список сотрудников + агрегаты по дням.
   * Доменный модуль не знает про amoCRM API — читает из локальной БД.
   */
  async getMonthly(year: number, month: number): Promise<SimReportPayload> {
    const excluded = config.reportExcludedUserIds

    const entries     = await fetchEntriesByUserDay(year, month, excluded)
    const prevYear    = month === 1 ? year - 1 : year
    const prevMonthN  = month === 1 ? 12 : month - 1
    const prevEntries = await fetchEntriesByUserDay(prevYear, prevMonthN, excluded)

    // В таблицу попадают только сотрудники, у которых есть оформления
    // в текущем месяце — пустые строки в календаре только зашумляют отчёт.
    const userIds = Array.from(new Set(entries.map(e => e.userId)))
    const usersData = userIds.length
      ? await db.select().from(amocrmUsers).where(inArray(amocrmUsers.id, userIds))
      : []

    const users: SimReportUser[] = usersData
      .map(u => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    // Агрегаты по дням — считаем прямо из entries, чтобы не делать ещё запросы
    const dayTotals          = sumByDay(entries)
    const prevMonthDayTotals = sumByDay(prevEntries)
    const prevDaysInMonth    = new Date(prevYear, prevMonthN, 0).getDate()

    return {
      year,
      month,
      users,
      entries,
      prevEntries,
      dayTotals,
      prevMonthDayTotals,
      prevMonth: { year: prevYear, month: prevMonthN, daysInMonth: prevDaysInMonth },
    }
  },

  /**
   * Возвращает суммы оформлений по месяцам за последние N месяцев (включая текущий).
   * Используется для графика "Динамика по месяцам" — независим от того, какой
   * месяц сейчас открыт в календаре.
   */
  async getMonthlyDynamics(monthsBack: number): Promise<SimReportMonthlyPoint[]> {
    const excluded = config.reportExcludedUserIds

    // Стартовая дата — первое число (today - monthsBack + 1)
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1)
    const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`

    const dateFilter = sql`${simRegistrations.registeredOn} >= ${startIso}`
    const where = excluded.length
      ? and(dateFilter, notInArray(simRegistrations.responsibleUserId, excluded))
      : dateFilter

    const rows = await db
      .select({
        ym:    sql<string>`to_char(${simRegistrations.registeredOn}, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(simRegistrations)
      .where(where)
      .groupBy(sql`to_char(${simRegistrations.registeredOn}, 'YYYY-MM')`)

    const map = new Map<string, number>()
    for (const r of rows) map.set(String(r.ym), Number(r.count))

    // Заполняем все месяцы подряд (даже пустые), чтобы фронт не строил «дырявый» график
    const out: SimReportMonthlyPoint[] = []
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      out.push({ year: y, month: m, count: map.get(key) ?? 0 })
    }
    return out
  },

  /**
   * Аналог getMonthly, но считает ВСЕ сделки воронки, попавшие в систему
   * за месяц (по amocrm_deals.created_at), а не только те, у которых
   * проставлено поле даты регистрации сим-карты.
   *
   * Используется для второго графика "Динамика по дням (поступившие заявки)".
   */
  async getIncomingMonthly(year: number, month: number): Promise<IncomingDealsPayload> {
    const excluded = config.reportExcludedUserIds

    const fetchByMonth = async (y: number, m: number): Promise<SimReportEntry[]> => {
      const { from, to } = monthRange(y, m)
      // created_at в БД — timestamptz, поэтому приводим к date в TZ сервера.
      // Этого достаточно — sync-модуль уже кладёт его в UTC, а календарь
      // работает в часовом поясе сервера.
      const baseWhere = and(
        eq(amocrmDeals.pipelineId, config.AMOCRM_PIPELINE_ID),
        sql`${amocrmDeals.createdAt} >= ${from}::date`,
        sql`${amocrmDeals.createdAt} <  (${to}::date + interval '1 day')`,
      )
      const where = excluded.length
        ? and(baseWhere, notInArray(amocrmDeals.responsibleUserId, excluded))
        : baseWhere

      const rows = await db
        .select({
          userId: amocrmDeals.responsibleUserId,
          date:   sql<string>`to_char(${amocrmDeals.createdAt}, 'YYYY-MM-DD')`,
          count:  sql<number>`count(*)::int`,
        })
        .from(amocrmDeals)
        .where(where)
        .groupBy(amocrmDeals.responsibleUserId, sql`to_char(${amocrmDeals.createdAt}, 'YYYY-MM-DD')`)

      return rows
        .filter(r => r.userId != null)
        .map(r => ({
          userId: Number(r.userId),
          date:   String(r.date),
          count:  Number(r.count),
        }))
    }

    const entries     = await fetchByMonth(year, month)
    const prevYear    = month === 1 ? year - 1 : year
    const prevMonthN  = month === 1 ? 12 : month - 1
    const prevEntries = await fetchByMonth(prevYear, prevMonthN)

    const userIds = Array.from(new Set(entries.map(e => e.userId)))
    const usersData = userIds.length
      ? await db.select().from(amocrmUsers).where(inArray(amocrmUsers.id, userIds))
      : []

    const users: SimReportUser[] = usersData
      .map(u => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    const prevDaysInMonth = new Date(prevYear, prevMonthN, 0).getDate()

    return {
      year,
      month,
      users,
      entries,
      prevEntries,
      prevMonth: { year: prevYear, month: prevMonthN, daysInMonth: prevDaysInMonth },
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
