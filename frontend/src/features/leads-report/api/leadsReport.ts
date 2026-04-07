import { http } from '../../../shared/api/http'

export interface LossReasonRow {
  reasonId:   number | null
  reasonName: string
  count:      number
}

export interface LeadsReportPayload {
  year:            number
  month:           number
  newStageId:      number
  newStageName:    string
  total:           number
  advancedPastNew: number
  lostTotal:       number
  lostByReason:    LossReasonRow[]
}

export function fetchLeadsReport(year: number, month: number): Promise<LeadsReportPayload> {
  return http<LeadsReportPayload>(`/api/leads-report?year=${year}&month=${month}`)
}
