/**
 * Базовый http-клиент. Работает и в dev (vite proxy), и в виджете (rewrite в build-time через VITE_API_BASE).
 */
const BASE = import.meta.env.VITE_API_BASE ?? ''

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставим только если есть тело — иначе Fastify отвечает 400
  // ("Body cannot be empty when content-type is set to 'application/json'")
  // на безтелесные POST-ы вроде /api/sync/run.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) }
  if (init?.body != null && headers['Content-Type'] == null) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
