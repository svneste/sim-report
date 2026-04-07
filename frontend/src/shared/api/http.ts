/**
 * Базовый http-клиент. Работает и в dev (vite proxy), и в виджете (rewrite в build-time через VITE_API_BASE).
 */
const BASE = import.meta.env.VITE_API_BASE ?? ''

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}
