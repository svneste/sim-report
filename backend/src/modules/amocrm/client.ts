import { config } from '../../core/config.js'
import { getAccessToken } from './oauth.js'

const baseUrl = () => `https://${config.AMOCRM_SUBDOMAIN}.amocrm.ru`

export interface AmoCustomFieldValue {
  field_id:   number
  field_name?: string
  field_type?: string
  values:     Array<{ value: unknown }>
}

export interface AmoLead {
  id:                  number
  name:                string | null
  pipeline_id:         number
  status_id:           number
  responsible_user_id: number
  created_at:          number
  updated_at:          number
  custom_fields_values: AmoCustomFieldValue[] | null
  closed_at?:          number | null
  _embedded?: { companies?: Array<{ id: number }> }
}

export interface AmoCompany {
  id:   number
  name: string | null
  custom_fields_values: AmoCustomFieldValue[] | null
}

export interface AmoCustomFieldDef {
  id:    number
  name:  string
  type:  string
  enums: Array<{ id: number; value: string; sort?: number }> | null
}

export interface AmoPipeline {
  id:   number
  name: string
  _embedded?: { statuses?: AmoStatus[] }
}

export interface AmoUser {
  id:    number
  name:  string
  email: string
}

interface AmoListEnvelope<T> {
  _page:      number
  _embedded:  { [key: string]: T[] }
  _links?: {
    next?: { href: string }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Запрос к amoCRM с ретраями на 429/5xx (экспоненциальный backoff).
 * Бережём лимиты: см. правила работы с API CRM.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (res.status === 204) return undefined as T
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(500 * 2 ** attempt)
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`amoCRM API ${res.status} ${path}: ${text}`)
    }
    return res.json() as Promise<T>
  }
}

/**
 * Постранично выкачивает коллекцию по любому _embedded ключу.
 */
async function* paginate<T>(initialPath: string, embeddedKey: string): AsyncGenerator<T> {
  let path: string | null = initialPath
  while (path) {
    const env: AmoListEnvelope<T> = await request<AmoListEnvelope<T>>(path)
    const items = env._embedded?.[embeddedKey] ?? []
    for (const item of items) yield item
    const next = env._links?.next?.href
    if (!next) break
    // amoCRM возвращает абсолютный URL — обрежем до path
    const url = new URL(next)
    path = url.pathname + url.search
    await sleep(50) // пауза между страницами — не долбим API
  }
}

export const amocrm = {
  /**
   * Выкачка сделок воронки. updatedFromSec — unix-секунды для инкрементального sync.
   */
  async *leadsByPipeline(pipelineId: number, updatedFromSec?: number): AsyncGenerator<AmoLead> {
    const params = new URLSearchParams()
    params.set('with',                 'contacts')
    params.set('limit',                '250')
    params.set('filter[pipeline_id]',  String(pipelineId))
    if (updatedFromSec) params.set('filter[updated_at][from]', String(updatedFromSec))
    yield* paginate<AmoLead>(`/api/v4/leads?${params.toString()}`, 'leads')
  },

  /** Сделки конкретного этапа воронки (+ привязанные компании). */
  async *leadsByStatus(pipelineId: number, statusId: number): AsyncGenerator<AmoLead> {
    const params = new URLSearchParams()
    params.set('with',  'companies')
    params.set('limit', '250')
    params.set('filter[statuses][0][pipeline_id]', String(pipelineId))
    params.set('filter[statuses][0][status_id]',   String(statusId))
    yield* paginate<AmoLead>(`/api/v4/leads?${params.toString()}`, 'leads')
  },

  async pipelines(): Promise<AmoPipeline[]> {
    const env = await request<{ _embedded?: { pipelines?: AmoPipeline[] } }>('/api/v4/leads/pipelines')
    return env?._embedded?.pipelines ?? []
  },

  async customFields(entity: 'leads' | 'companies'): Promise<AmoCustomFieldDef[]> {
    const all: AmoCustomFieldDef[] = []
    for await (const f of paginate<AmoCustomFieldDef>(`/api/v4/${entity}/custom_fields?limit=250`, 'custom_fields')) {
      all.push(f)
    }
    return all
  },

  /** Компании по списку id (пачками по 50). */
  async companiesByIds(ids: number[]): Promise<AmoCompany[]> {
    const all: AmoCompany[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const params = new URLSearchParams()
      params.set('limit', '250')
      for (const id of ids.slice(i, i + 50)) params.append('filter[id][]', String(id))
      for await (const c of paginate<AmoCompany>(`/api/v4/companies?${params.toString()}`, 'companies')) all.push(c)
      await sleep(50)
    }
    return all
  },

  /** Массовое обновление сделок (пачками по 50). */
  async patchLeads(updates: Array<{ id: number; custom_fields_values: unknown[] }>): Promise<void> {
    for (let i = 0; i < updates.length; i += 50) {
      await request('/api/v4/leads', { method: 'PATCH', body: JSON.stringify(updates.slice(i, i + 50)) })
      await sleep(100)
    }
  },

  async *users(): AsyncGenerator<AmoUser> {
    yield* paginate<AmoUser>('/api/v4/users?limit=250', 'users')
  },

  /**
   * Список статусов воронки. Используем для определения первой стадии
   * (минимальный sort) и для подписей в отчётах. Системные статусы
   * 142 (успех) и 143 (закрыт-не-реализовано) тоже приходят.
   */
  async pipelineStatuses(pipelineId: number): Promise<AmoStatus[]> {
    const env = await request<{ _embedded?: { statuses?: AmoStatus[] } }>(
      `/api/v4/leads/pipelines/${pipelineId}/statuses`,
    )
    return env._embedded?.statuses ?? []
  },

  /**
   * Справочник причин закрытия (loss reasons) для всего аккаунта.
   * Нужен, чтобы по loss_reason_id из сделки получить человекочитаемое имя.
   */
  async lossReasons(): Promise<AmoLossReason[]> {
    const all: AmoLossReason[] = []
    for await (const r of paginate<AmoLossReason>('/api/v4/leads/loss_reasons?limit=250', 'loss_reasons')) {
      all.push(r)
    }
    return all
  },

  /**
   * События смены статуса сделок за период. amoCRM v4 не умеет фильтровать
   * по pipeline_id или по value_before — отбираем уже на нашей стороне.
   */
  async *leadStatusChangedEvents(fromSec: number, toSec: number): AsyncGenerator<AmoStatusChangedEvent> {
    const params = new URLSearchParams()
    params.set('filter[type]',              'lead_status_changed')
    params.set('filter[entity]',            'lead')
    params.set('filter[created_at][from]',  String(fromSec))
    params.set('filter[created_at][to]',    String(toSec))
    params.set('limit',                     '100')
    yield* paginate<AmoStatusChangedEvent>(`/api/v4/events?${params.toString()}`, 'events')
  },
}

export interface AmoStatus {
  id:          number
  name:        string
  sort:        number
  pipeline_id: number
  color?:      string
  type?:       number
}

export interface AmoLossReason {
  id:   number
  name: string
}

export interface AmoStatusChangedEvent {
  id:           string
  type:         'lead_status_changed'
  entity_id:    number
  entity_type:  'lead'
  created_at:   number
  value_before?: Array<{ lead_status?: { id: number; pipeline_id: number } }>
  value_after?:  Array<{ lead_status?: { id: number; pipeline_id: number } }>
}
