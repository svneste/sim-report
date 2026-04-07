import { http } from '../../../shared/api/http'

export interface AssociationRow {
  association: string
  total:       number
  counts:      Record<number, number>
}

export interface AssociationOption {
  name:  string
  total: number
}

export interface AssociationsReportPayload {
  year:        number
  month:       number
  totalGroups: number
  grandTotal:  number
  rows:        AssociationRow[]
  hasMore:     boolean
  allOptions:  AssociationOption[]
}

export function fetchAssociationsReport(
  year: number,
  month: number,
  limit: number,
  offset: number,
  selected: string[] = [],
): Promise<AssociationsReportPayload> {
  const params = new URLSearchParams({
    year:   String(year),
    month:  String(month),
    limit:  String(limit),
    offset: String(offset),
  })
  if (selected.length) {
    // Разделитель ||| — чтобы запятые внутри названий не ломали парсинг
    params.set('selected', selected.join('|||'))
  }
  return http<AssociationsReportPayload>(`/api/associations-report?${params.toString()}`)
}
