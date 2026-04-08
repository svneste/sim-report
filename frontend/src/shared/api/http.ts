/**
 * Базовый http-клиент. Работает и в dev (vite proxy), и в виджете (rewrite в build-time через VITE_API_BASE).
 *
 * На каждый запрос подставляет Authorization: Bearer <access_token> из BX24.js.
 * Бэк (b24-auth.hook) валидирует токен через app.info Bitrix24, без него
 * любой /api/* отвечает 401. Если SPA открыта вне B24 — токена нет, заголовок
 * не ставится, бэк отказывает (этого мы и хотим — жёсткая защита).
 */
import { getB24Token } from '../bitrix24/bx24'

const BASE = import.meta.env.VITE_API_BASE ?? ''

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставим только если есть тело — иначе Fastify отвечает 400
  // ("Body cannot be empty when content-type is set to 'application/json'")
  // на безтелесные POST-ы вроде /api/sync/run.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) }
  if (init?.body != null && headers['Content-Type'] == null) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getB24Token()
  if (token && headers['Authorization'] == null) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
