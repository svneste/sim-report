import { and, asc, between, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmDeals, amocrmUsers, leadStatusTransitions, simRegistrations } from '../../db/schema.js'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { amocrm } from '../amocrm/client.js'

/**
 * Имена стадий воронки, которые считаются "номер включён".
 * Сравнение по нормализованному имени (lowercase, ё→е, лишние пробелы),
 * чтобы переименование с пробелами/регистром не ломало отчёт.
 *
 * 142 — системный статус "успешно реализовано", он есть в любой воронке
 * и его ID не меняется. "Договор отправлен" — кастомный, ищем по имени.
 */
const SUCCESS_STATUS_NAMES = ['успешно реализовано', 'договор отправлен']
const SYSTEM_WON_STATUS_ID = 142
const SYSTEM_LOST_STATUS_ID = 143

/**
 * Имя стадии, начиная с которой клиент считается "квал" (целевым).
 * Все статусы с sort >= sort этой стадии (плюс 142) попадают в группу.
 */
const QUALIFIED_FROM_STAGE_NAME = 'клиент ответил'

function normalizeStatusName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

export interface StatusGroups {
  /** "Договор отправлен" + "Успешно реализовано" — номер включён */
  successIds:   number[]
  /** Все стадии от "Клиент ответил" вниз по воронке + 142 */
  qualifiedIds: number[]
}

interface StatusGroupsCache { groups: StatusGroups; expiresAt: number }
let statusGroupsCache: StatusGroupsCache | null = null
const STATUS_CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Резолвит обе группы статусов одним обходом pipelineStatuses, кэширует
 * на 10 минут. Все ошибки невалит — отчёт лучше показать частично, чем
 * упасть, если amoCRM сейчас недоступен.
 */
async function getStatusGroups(): Promise<StatusGroups> {
  if (statusGroupsCache && statusGroupsCache.expiresAt > Date.now()) {
    return statusGroupsCache.groups
  }
  const successIds   = new Set<number>([SYSTEM_WON_STATUS_ID])
  const qualifiedIds = new Set<number>([SYSTEM_WON_STATUS_ID])

  try {
    const statuses = await amocrm.pipelineStatuses(config.AMOCRM_PIPELINE_ID)
    const wantedSuccess = new Set(SUCCESS_STATUS_NAMES.map(normalizeStatusName))

    // Собираем success статусы по имени
    for (const s of statuses) {
      if (wantedSuccess.has(normalizeStatusName(s.name))) successIds.add(s.id)
    }

    // Находим sort стадии "Клиент ответил"; берём все статусы с sort
    // >= неё (исключая системную "потеря" 143)
    const ko = statuses.find(s => normalizeStatusName(s.name) === QUALIFIED_FROM_STAGE_NAME)
    if (ko) {
      for (const s of statuses) {
        if (s.id === SYSTEM_LOST_STATUS_ID) continue
        if (s.sort >= ko.sort) qualifiedIds.add(s.id)
      }
    } else {
      logger.warn('qualified anchor stage not found in pipeline', { name: QUALIFIED_FROM_STAGE_NAME })
    }
  } catch (e) {
    logger.warn('failed to fetch pipeline statuses', e)
  }

  const groups: StatusGroups = {
    successIds:   [...successIds],
    qualifiedIds: [...qualifiedIds],
  }
  statusGroupsCache = { groups, expiresAt: Date.now() + STATUS_CACHE_TTL_MS }
  logger.info('status groups resolved', groups)
  return groups
}

/**
 * Тонкая обёртка для совместимости — раньше пользовали отдельный
 * getSuccessStatusIds, теперь он живёт внутри getStatusGroups.
 */
async function getSuccessStatusIds(): Promise<number[]> {
  return (await getStatusGroups()).successIds
}

/**
 * ID custom-поля "Объединение" в amoCRM. Захардкожен здесь, потому что
 * это часть домена отчёта, а не общая настройка интеграции.
 * Если у поля поменяется ID — меняем тут.
 */
const ASSOCIATION_FIELD_ID = 539431

/**
 * ID custom-поля "MNP" (галка). Если в сделке проставлено — это
 * перенос номера, иначе — новый номер.
 */
const MNP_FIELD_ID = 539425

export type NumberType = 'all' | 'mnp' | 'new'

/**
 * SQL-условие для фильтрации сделок по типу номера. Возвращает либо
 * фрагмент drizzle SQL, либо undefined для 'all' — чтобы вызывающий
 * мог не оборачивать его в and(...).
 *
 * Логика:
 *  - mnp: в raw.custom_fields_values есть запись с field_id=MNP_FIELD_ID,
 *    у которой хотя бы один values[].value не false/0/'' (галка стоит).
 *  - new: обратное условие — записи нет, или она пустая, или value=false.
 */
function mnpFilter(numberType: NumberType) {
  if (numberType === 'all') return undefined

  const hasMnpFlag = sql`
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${amocrmDeals.raw}->'custom_fields_values') AS cf
      WHERE (cf->>'field_id')::bigint = ${MNP_FIELD_ID}
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(cf->'values') AS v
        WHERE COALESCE(v->>'value', '') NOT IN ('false', '0', '')
      )
    )
  `
  return numberType === 'mnp' ? hasMnpFlag : sql`NOT (${hasMnpFlag})`
}

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
  /** Все поступившие сделки за месяц (по deal.created_at в МСК) */
  incoming:  number
  /** Из них клиент дошёл до стадии "Клиент ответил" или дальше */
  qualified: number
  /** Из них номер реально включён (success-стадии) */
  activated: number
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
   * Динамика по месяцам — funnel-вид: для каждого месяца показывает
   * сколько заявок поступило, сколько из них дошло до квал-клиентов
   * и сколько в итоге включилось.
   *
   * Группировка везде по deal.created_at в МСК, чтобы линии можно
   * было сравнивать как воронку. Все три метрики идут из amocrm_deals
   * по текущему status_id — это позволяет показать данные за все
   * месяцы, даже за пределами 90-дневного бэкфилла lead_status_transitions.
   *
   * Минусы такого подхода: сделка, которая когда-то была "квал", но
   * сейчас перешла в потерянную (143), не попадёт в "qualified". Для
   * текущей воронки это допустимо.
   */
  async getMonthlyDynamics(monthsBack: number, numberType: NumberType = 'all'): Promise<SimReportMonthlyPoint[]> {
    const groups = await getStatusGroups()
    const successIds   = groups.successIds
    const qualifiedIds = groups.qualifiedIds

    // Стартовая дата — первое число (today - monthsBack + 1) в МСК
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1)
    const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`

    const ym = sql<string>`to_char(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow', 'YYYY-MM')`
    const mnpWhere = mnpFilter(numberType)
    const baseWhere = and(
      eq(amocrmDeals.pipelineId, config.AMOCRM_PIPELINE_ID),
      sql`(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow') >= ${startIso}::timestamp`,
      ...(mnpWhere ? [mnpWhere] : []),
    )

    // Один запрос со всеми тремя метриками — count(*) для incoming,
    // FILTER (...) для qualified и activated. Это сильно дешевле трёх
    // отдельных раундтрипов в pg.
    const rows = await db
      .select({
        ym,
        incoming:  sql<number>`count(*)::int`,
        qualified: sql<number>`count(*) FILTER (WHERE ${amocrmDeals.statusId} = ANY(${qualifiedIds}::bigint[]))::int`,
        activated: sql<number>`count(*) FILTER (WHERE ${amocrmDeals.statusId} = ANY(${successIds}::bigint[]))::int`,
      })
      .from(amocrmDeals)
      .where(baseWhere)
      .groupBy(ym)

    const map = new Map<string, { incoming: number; qualified: number; activated: number }>()
    for (const r of rows) {
      map.set(String(r.ym), {
        incoming:  Number(r.incoming),
        qualified: Number(r.qualified),
        activated: Number(r.activated),
      })
    }

    // Заполняем все месяцы подряд — даже пустые, чтобы линии шли непрерывно
    const out: SimReportMonthlyPoint[] = []
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      const v = map.get(key) ?? { incoming: 0, qualified: 0, activated: 0 }
      out.push({ year: y, month: m, ...v })
    }
    return out
  },

  /**
   * Аналог getMonthly, но считает ВСЕ сделки воронки, попавшие в систему
   * за месяц, а не только те, у которых проставлено поле даты регистрации
   * сим-карты.
   *
   * Отличия от sim-report:
   *  - не фильтруем REPORT_EXCLUDED_USER_IDS — для "поступивших"
   *    управленческие юзеры тоже считаются;
   *  - не выкидываем сделки без ответственного — только что заведённые
   *    заявки часто ещё без owner'а, а они нам нужны;
   *  - дату созданя группируем по часовому поясу Europe/Moscow, потому что
   *    воронка работает в МСК — иначе заявки 21:00–23:59 МСК уезжают
   *    в следующий UTC-день и портят суточные суммы.
   */
  async getIncomingMonthly(year: number, month: number): Promise<IncomingDealsPayload> {
    const fetchByMonth = async (y: number, m: number): Promise<SimReportEntry[]> => {
      const { from, to } = monthRange(y, m)

      // Дату созданя приводим к МСК и группируем по дню МСК.
      // Сравнение диапазона тоже в МСК — `(created_at AT TIME ZONE 'Europe/Moscow')`
      // даёт timestamp без TZ (wall clock МСК), который сравнивается
      // с границами календарного дня.
      const mskDate = sql<string>`to_char(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD')`
      const baseWhere = and(
        eq(amocrmDeals.pipelineId, config.AMOCRM_PIPELINE_ID),
        sql`(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow') >= ${from}::timestamp`,
        sql`(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow') <  (${to}::date + interval '1 day')::timestamp`,
      )

      const rows = await db
        .select({
          // 0 — синтетический «без ответственного»; entries с таким userId
          // суммируются в общую линию графика, но в чипах не появляются
          // (в amocrm_users такого юзера нет).
          userId: sql<number>`coalesce(${amocrmDeals.responsibleUserId}, 0)::bigint`,
          date:   mskDate,
          count:  sql<number>`count(*)::int`,
        })
        .from(amocrmDeals)
        .where(baseWhere)
        .groupBy(sql`coalesce(${amocrmDeals.responsibleUserId}, 0)`, mskDate)

      return rows.map(r => ({
        userId: Number(r.userId),
        date:   String(r.date),
        count:  Number(r.count),
      }))
    }

    const entries     = await fetchByMonth(year, month)
    const prevYear    = month === 1 ? year - 1 : year
    const prevMonthN  = month === 1 ? 12 : month - 1
    const prevEntries = await fetchByMonth(prevYear, prevMonthN)

    const total = entries.reduce((s, e) => s + e.count, 0)
    logger.info('incoming-monthly', { year, month, rows: entries.length, total })

    // Подгружаем имена и аватарки для тех ответственных, что реально есть
    // в списке (id=0 пропускаем — это синтетический «без ответственного»).
    const userIds = Array.from(new Set(entries.map(e => e.userId).filter(id => id > 0)))
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
   * Из тех же поступивших сделок отдаём только те, что в итоге дошли
   * до стадий "Договор отправлен" / "Успешно реализовано". Группировка
   * по amocrm_deals.created_at, чтобы график "успешные" сравнивался
   * с "поступившими" по одной и той же оси (день, когда заявка пришла).
   *
   * Замечание: смотрим только текущий status_id сделки. Если когда-нибудь
   * сделку откатят из success в другой статус, мы её перестанем считать —
   * для текущей воронки это допустимо, success-статусы там терминальные.
   */
  async getSuccessfulIncomingMonthly(year: number, month: number): Promise<IncomingDealsPayload> {
    const successStatusIds = await getSuccessStatusIds()
    if (!successStatusIds.length) {
      // На всякий случай — пустой ответ, чтобы фронт не падал
      const prevYear   = month === 1 ? year - 1 : year
      const prevMonthN = month === 1 ? 12 : month - 1
      return {
        year, month, users: [], entries: [], prevEntries: [],
        prevMonth: { year: prevYear, month: prevMonthN, daysInMonth: new Date(prevYear, prevMonthN, 0).getDate() },
      }
    }

    const fetchByMonth = async (y: number, m: number): Promise<SimReportEntry[]> => {
      const { from, to } = monthRange(y, m)
      const mskDate = sql<string>`to_char(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD')`
      const baseWhere = and(
        eq(amocrmDeals.pipelineId, config.AMOCRM_PIPELINE_ID),
        inArray(amocrmDeals.statusId, successStatusIds),
        sql`(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow') >= ${from}::timestamp`,
        sql`(${amocrmDeals.createdAt} AT TIME ZONE 'Europe/Moscow') <  (${to}::date + interval '1 day')::timestamp`,
      )

      const rows = await db
        .select({
          userId: sql<number>`coalesce(${amocrmDeals.responsibleUserId}, 0)::bigint`,
          date:   mskDate,
          count:  sql<number>`count(*)::int`,
        })
        .from(amocrmDeals)
        .where(baseWhere)
        .groupBy(sql`coalesce(${amocrmDeals.responsibleUserId}, 0)`, mskDate)

      return rows.map(r => ({
        userId: Number(r.userId),
        date:   String(r.date),
        count:  Number(r.count),
      }))
    }

    const entries     = await fetchByMonth(year, month)
    const prevYear    = month === 1 ? year - 1 : year
    const prevMonthN  = month === 1 ? 12 : month - 1
    const prevEntries = await fetchByMonth(prevYear, prevMonthN)

    const total = entries.reduce((s, e) => s + e.count, 0)
    logger.info('successful-incoming-monthly', { year, month, rows: entries.length, total, statusIds: successStatusIds })

    const userIds = Array.from(new Set(entries.map(e => e.userId).filter(id => id > 0)))
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
   * Считает, сколько сделок в каждый день месяца перешло на стадию
   * "Договор отправлен" / "Успешно реализовано" — это и есть фактическая
   * дата включения номера. Источник данных — таблица lead_status_transitions,
   * которую наполняет sync-модуль из amoCRM events API.
   *
   * Если для одной сделки за день есть несколько переходов на success
   * (например, откатили и вернули), считаем по количеству уникальных
   * сделок, а не по числу переходов — иначе суммы вырастут.
   */
  async getActivatedMonthly(year: number, month: number): Promise<IncomingDealsPayload> {
    const successStatusIds = await getSuccessStatusIds()
    if (!successStatusIds.length) {
      const prevYear   = month === 1 ? year - 1 : year
      const prevMonthN = month === 1 ? 12 : month - 1
      return {
        year, month, users: [], entries: [], prevEntries: [],
        prevMonth: { year: prevYear, month: prevMonthN, daysInMonth: new Date(prevYear, prevMonthN, 0).getDate() },
      }
    }

    const fetchByMonth = async (y: number, m: number): Promise<SimReportEntry[]> => {
      const { from, to } = monthRange(y, m)
      const mskDate = sql<string>`to_char(${leadStatusTransitions.occurredAt} AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD')`

      // Подзапрос: для каждой пары (deal_id, день МСК) берём первый
      // переход на success-статус. Это даёт нам "момент включения номера",
      // даже если потом сделку откатывали и снова вели на success.
      const baseWhere = and(
        eq(leadStatusTransitions.pipelineId, config.AMOCRM_PIPELINE_ID),
        inArray(leadStatusTransitions.statusId, successStatusIds),
        sql`(${leadStatusTransitions.occurredAt} AT TIME ZONE 'Europe/Moscow') >= ${from}::timestamp`,
        sql`(${leadStatusTransitions.occurredAt} AT TIME ZONE 'Europe/Moscow') <  (${to}::date + interval '1 day')::timestamp`,
      )

      // distinct-по-сделке-в-день: count(distinct deal_id) на день
      const rows = await db
        .select({
          // ответственный из основной таблицы сделок (чтобы попасть в users)
          userId: sql<number>`coalesce(${amocrmDeals.responsibleUserId}, 0)::bigint`,
          date:   mskDate,
          count:  sql<number>`count(distinct ${leadStatusTransitions.dealId})::int`,
        })
        .from(leadStatusTransitions)
        .leftJoin(amocrmDeals, eq(amocrmDeals.id, leadStatusTransitions.dealId))
        .where(baseWhere)
        .groupBy(sql`coalesce(${amocrmDeals.responsibleUserId}, 0)`, mskDate)

      return rows.map(r => ({
        userId: Number(r.userId),
        date:   String(r.date),
        count:  Number(r.count),
      }))
    }

    const entries     = await fetchByMonth(year, month)
    const prevYear    = month === 1 ? year - 1 : year
    const prevMonthN  = month === 1 ? 12 : month - 1
    const prevEntries = await fetchByMonth(prevYear, prevMonthN)

    const total = entries.reduce((s, e) => s + e.count, 0)
    logger.info('activated-monthly', { year, month, rows: entries.length, total })

    const userIds = Array.from(new Set(entries.map(e => e.userId).filter(id => id > 0)))
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
