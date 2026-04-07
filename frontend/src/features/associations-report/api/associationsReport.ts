import { http } from '../../../shared/api/http'

export interface AssociationRow {
  association: string
  total:       number
  counts:      Record<number, number>
}

export interface AssociationsReportPayload {
  year:        number
  month:       number
  totalGroups: number
  grandTotal:  number
  rows:        AssociationRow[]
  hasMore:     boolean
}

export function fetchAssociationsReport(
  year: number,
  month: number,
  limit: number,
  offset: number,
): Promise<AssociationsReportPayload> {
  const params = new URLSearchParams({
    year:   String(year),
    month:  String(month),
    limit:  String(limit),
    offset: String(offset),
  })
  return http<AssociationsReportPayload>(`/api/associations-report?${params.toString()}`)
}
