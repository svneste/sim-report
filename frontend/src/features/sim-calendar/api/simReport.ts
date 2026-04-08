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
