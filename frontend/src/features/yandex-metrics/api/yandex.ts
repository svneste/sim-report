import { getB24Token } from '../../../shared/bitrix24/bx24'

const BASE = import.meta.env.VITE_API_BASE ?? ''

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function parse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json as T
}

// ===================== Типы =====================

export interface YandexSite {
  id:                number
  name:              string
  counterId:         number
  goalId:            number | null
  domain:            string | null
  amocrmPipelineId:  number | null
  amocrmPageFieldId: number | null
  createdAt:         string
}

/** Данные формы создания/редактирования сайта. */
export interface SiteForm {
  name:              string
  counterId:         number
  goalId?:           number | null
  domain?:           string | null
  amocrmPipelineId?: number | null
  amocrmPageFieldId?: number | null
}

export interface PageRow {
  url:               string
  visits:            number
  visitors:          number
  leadsMetrika:      number
  conversionMetrika: number
}

export interface YandexReport {
  site:   { id: number; name: string; counterId: number; goalId: number | null; hasGoal: boolean }
  from:   string
  to:     string
  totals: { visitors: number; visits: number; leadsMetrika: number; conversionMetrika: number }
  pages:  PageRow[]
  amocrm: { configured: boolean; deals: number | null }
}

// ===================== Сайты (CRUD) =====================

export async function fetchSites(): Promise<YandexSite[]> {
  const res = await fetch(`${BASE}/api/yandex/sites`, { headers: authHeaders() })
  return parse<YandexSite[]>(res)
}

export async function createSite(form: SiteForm): Promise<YandexSite> {
  const res = await fetch(`${BASE}/api/yandex/sites`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(form),
  })
  return parse<YandexSite>(res)
}

export async function updateSite(id: number, form: SiteForm): Promise<YandexSite> {
  const res = await fetch(`${BASE}/api/yandex/sites/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(form),
  })
  return parse<YandexSite>(res)
}

export async function deleteSite(id: number): Promise<{ deleted: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/yandex/sites/${id}`, { method: 'DELETE', headers: authHeaders() })
  return parse<{ deleted: boolean; error?: string }>(res)
}

// ===================== Отчёт =====================

export async function fetchYandexReport(siteId: number, from?: string, to?: string): Promise<YandexReport> {
  const params = new URLSearchParams({ siteId: String(siteId) })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const res = await fetch(`${BASE}/api/yandex/report?${params.toString()}`, { headers: authHeaders() })
  return parse<YandexReport>(res)
}
