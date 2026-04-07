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
