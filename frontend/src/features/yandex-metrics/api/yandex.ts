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

export interface AmoFunnel {
  newRequests:  number   // всего заявок с источника (Новое обращение)
  advanced:     number   // перешли дальше Нового обращения
  connected:    number   // подключено: «Договор отправлен» или «Успешно»
  connectedNew: number   // из них новые номера
  connectedMnp: number   // из них MNP (порт)
  lost:         number   // не реализовано
}

export interface PageGroup {
  key:               string
  label:             string
  name:              string | null   // ручное название клиента (если задано)
  createdDate:       string | null   // дата создания (ручная, YYYY-MM-DD)
  launchDate:        string | null   // дата запуска (ручная, YYYY-MM-DD)
  visits:            number
  visitors:          number
  leadsMetrika:      number
  conversionMetrika: number
  funnel:            AmoFunnel | null // воронка amoCRM по источнику (null — данных нет)
  pages:             PageRow[]
}

export interface YandexReport {
  site:   { id: number; name: string; counterId: number; goalId: number | null; hasGoal: boolean }
  from:   string
  to:     string
  totals: { visitors: number; visits: number; leadsMetrika: number; conversionMetrika: number }
  groups: PageGroup[]
  amocrm: { configured: boolean; deals: number | null }
  amocrmFunnel: boolean   // доступна ли воронка amoCRM по источникам
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

export interface ClientMeta {
  name?:        string
  createdDate?: string
  launchDate?:  string
}

/** Задать/очистить ручные данные клиента (название + даты) по slug. Пустые поля — сброс. */
export async function setClientMeta(siteId: number, slug: string, meta: ClientMeta): Promise<{ siteId: number; slug: string; name: string | null; createdDate: string | null; launchDate: string | null }> {
  const res = await fetch(`${BASE}/api/yandex/sites/${siteId}/client-meta`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify({ slug, ...meta }),
  })
  return parse<{ siteId: number; slug: string; name: string | null; createdDate: string | null; launchDate: string | null }>(res)
}
