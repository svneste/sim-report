import { http } from '../../../shared/api/http'

export interface SimReportUser {
  id:     number
  name:   string
  email:  string | null
  avatar: string | null
}

export interface SimReportEntry {
  userId: number
  date:   string
  count:  number
}

export interface SimReportPayload {
  year:    number
  month:   number
  users:   SimReportUser[]
  entries: SimReportEntry[]
  prevEntries: SimReportEntry[]
  dayTotals: Record<number, number>
  prevMonthDayTotals: Record<number, number>
  prevMonth: { year: number; month: number; daysInMonth: number }
}

export function fetchSimReport(year: number, month: number): Promise<SimReportPayload> {
  return http<SimReportPayload>(`/api/sim-report?year=${year}&month=${month}`)
}

export interface SimReportDeal {
  id:          number
  name:        string | null
  association: string | null
  url:         string
}

export function fetchDealsForCell(userId: number, date: string): Promise<{ deals: SimReportDeal[] }> {
  return http<{ deals: SimReportDeal[] }>(`/api/sim-report/deals?userId=${userId}&date=${encodeURIComponent(date)}`)
}

export interface SyncRunResult {
  leadsUpserted:    number
  usersUpserted:    number
  simRowsUpserted:  number
  startedAt:        string
  finishedAt:       string
}

/**
 * Триггерит синхронизацию с amoCRM.
 * @param hours окно инкрементального sync (по умолчанию 6 часов).
 *              Не передавай 0 — это запустит полный sync на десятки тысяч сделок.
 */
export function runSync(hours = 6): Promise<SyncRunResult> {
  return http<SyncRunResult>(`/api/sync/run?hours=${hours}`, { method: 'POST' })
}

export interface MonthlyPoint {
  year:  number
  month: number
  count: number
}

export function fetchMonthlyDynamics(months = 12): Promise<{ points: MonthlyPoint[] }> {
  return http<{ points: MonthlyPoint[] }>(`/api/sim-report/monthly?months=${months}`)
}

export interface IncomingDealsPayload {
  year:    number
  month:   number
  users:   SimReportUser[]
  entries: SimReportEntry[]
  prevEntries: SimReportEntry[]
  prevMonth: { year: number; month: number; daysInMonth: number }
}

/**
 * Считает все поступившие сделки воронки за указанный месяц
 * (по amocrm_deals.created_at), без фильтра по факту регистрации сим-карты.
 * Используется для второго графика "Динамика по дням (поступившие заявки)".
 */
export function fetchIncomingDeals(year: number, month: number): Promise<IncomingDealsPayload> {
  return http<IncomingDealsPayload>(`/api/sim-report/incoming?year=${year}&month=${month}`)
}

/**
 * Из тех же поступивших отдаёт только сделки, которые в итоге дошли до
 * стадий "Договор отправлен" / "Успешно реализовано" — то есть номера,
 * которые реально были включены. График сравнивает текущий месяц
 * с предыдущим, как и остальные.
 */
export function fetchSuccessfulDeals(year: number, month: number): Promise<IncomingDealsPayload> {
  return http<IncomingDealsPayload>(`/api/sim-report/successful?year=${year}&month=${month}`)
}

/**
 * Включения по фактической дате перехода сделки на success-стадию
 * (берётся из таблицы lead_status_transitions, которую наполняет
 * sync-модуль из amoCRM events API). Это ответ на вопрос "сколько
 * номеров реально включили в день N", в отличие от fetchSuccessfulDeals,
 * который группирует по дню поступления заявки.
 */
export function fetchActivatedDeals(year: number, month: number): Promise<IncomingDealsPayload> {
  return http<IncomingDealsPayload>(`/api/sim-report/activated?year=${year}&month=${month}`)
}

export interface AvatarsFromBitrixResult {
  receivedB24Users: number
  matched:          number
  updated:          number
  unmatchedAmocrm:  string[]
}

/**
 * Шлёт сырых юзеров B24 (как их отдал BX24.callMethod('user.get'))
 * на бэк, который сопоставит их с amocrm_users по ФИО и обновит avatar_url.
 */
export function pushBitrixAvatars(
  users: Array<Record<string, unknown>>,
): Promise<AvatarsFromBitrixResult> {
  return http<AvatarsFromBitrixResult>('/api/users/avatars-from-bitrix', {
    method: 'POST',
    body:   JSON.stringify({ users }),
  })
}
