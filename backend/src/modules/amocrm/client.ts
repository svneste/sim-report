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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`amoCRM API ${res.status} ${path}: ${text}`)
  }
  return res.json() as Promise<T>
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

  async *users(): AsyncGenerator<AmoUser> {
    yield* paginate<AmoUser>('/api/v4/users?limit=250', 'users')
  },
}
