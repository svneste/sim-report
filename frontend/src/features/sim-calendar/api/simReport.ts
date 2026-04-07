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
