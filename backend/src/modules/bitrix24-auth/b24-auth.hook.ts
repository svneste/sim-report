import type { FastifyRequest, FastifyReply } from 'fastify'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'

/**
 * Жёсткая защита /api/* — пропускаем только запросы, у которых в заголовке
 * Authorization лежит валидный access_token из BX24.js.
 *
 * Алгоритм:
 *  1. Достаём токен из `Authorization: Bearer <token>`.
 *  2. Проверяем во внутреннем кэше (TTL 5 минут) — если уже верифицировали,
 *     не дёргаем Bitrix24.
 *  3. Если нет — делаем GET на `https://<BITRIX24_DOMAIN>/rest/app.info.json?auth=<token>`.
 *     - Если 200 OK и в ответе есть `result` — токен валидный, а сам токен
 *       привязан именно к нашему локальному приложению (app.info так
 *       устроен — без приложения он не отвечает). Кэшируем.
 *     - Иначе — 401.
 *  4. /health не защищён, чтобы health-чек compose работал.
 *
 * Замечание: BX24.js на фронте сам рефрешит токен, так что после истечения
 * мы получим новый access_token и просто заведём для него новую запись в кэше.
 */

interface CacheEntry {
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000
const VERIFY_TIMEOUT_MS = 5_000

// Маршруты, которые проверяются. /health и любые не-/api запросы пропускаем.
function isProtected(url: string): boolean {
  // url приходит вида "/api/sim-report?year=2026&month=4"
  const path = url.split('?')[0]
  if (path === '/health') return false
  return path.startsWith('/api/')
}

async function verifyTokenWithBitrix24(token: string): Promise<boolean> {
  const url = `https://${config.BITRIX24_DOMAIN}/rest/app.info.json?auth=${encodeURIComponent(token)}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return false
    const json = await res.json() as { result?: unknown; error?: string; error_description?: string }
    if (json.error) {
      logger.warn('b24 token rejected', { error: json.error, desc: json.error_description })
      return false
    }
    return Boolean(json.result)
  } catch (e) {
    logger.warn('b24 token verify failed', e)
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function bitrix24AuthHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isProtected(req.url)) return

  const header = req.headers['authorization']
  const token = typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null

  if (!token) {
    reply.code(401).send({ error: 'b24 auth required' })
    return
  }

  const cached = cache.get(token)
  if (cached && cached.expiresAt > Date.now()) return

  const ok = await verifyTokenWithBitrix24(token)
  if (!ok) {
    // Чистим возможный устаревший кэш для этого токена
    cache.delete(token)
    reply.code(401).send({ error: 'b24 token invalid' })
    return
  }
  cache.set(token, { expiresAt: Date.now() + CACHE_TTL_MS })
}
