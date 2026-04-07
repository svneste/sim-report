import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmUsers } from '../../db/schema.js'
import { logger } from '../../core/logger.js'

const bodySchema = z.object({
  /**
   * Карта userId → URL аватарки. Передаётся виджетом amoCRM на основе
   * данных AMOCRM.constant('account').users — это единственный надёжный
   * способ получить реальные фото сотрудников, т.к. публичный REST API
   * amoCRM их не отдаёт.
   */
  avatars: z.record(z.string(), z.string().url()),
})

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/users/avatars', async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid body', details: parsed.error.flatten() }
    }

    const entries = Object.entries(parsed.data.avatars)
      .map(([id, url]) => ({ id: Number(id), url }))
      .filter(e => Number.isFinite(e.id) && e.url)

    if (!entries.length) return { updated: 0 }

    let updated = 0
    for (const e of entries) {
      const res = await db.execute(sql`
        update ${amocrmUsers}
        set avatar_url = ${e.url}, updated_at = now()
        where id = ${e.id}
      `)
      // postgres-js драйвер для drizzle возвращает count в `count` или длине rows
      const c = (res as unknown as { count?: number }).count ?? 0
      updated += c
    }

    logger.info('avatars updated', { received: entries.length, updated })
    return { received: entries.length, updated }
  })
}
