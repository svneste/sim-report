import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { config } from '../../core/config.js'
import { paymentsService } from './payments.service.js'

const yearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
})

const cellSchema = z.object({
  category: z.string().min(1),
  type:     z.enum(['income', 'expense']),
  year:     z.coerce.number().int().min(2000).max(2100),
  month:    z.coerce.number().int().min(1).max(12),
})

export const paymentsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/payments/sync
   * Запускает синхронизацию платежей из B24 в PostgreSQL.
   * Использует access_token из Authorization header для вызова B24 REST API.
   */
  app.post('/api/payments/sync', async (req) => {
    const header = req.headers['authorization']
    const token = typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : null
    if (!token) return { error: 'no token' }

    return paymentsService.sync(config.BITRIX24_DOMAIN, token)
  })

  /**
   * GET /api/payments?year=2025
   * Возвращает агрегированные данные по платежам за указанный год.
   */
  app.get('/api/payments', async (req, reply) => {
    const parsed = yearSchema.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid query', details: parsed.error.flatten() }
    }
    return paymentsService.getByYear(parsed.data.year)
  })

  /**
   * GET /api/payments/cell?category=...&type=income&year=2025&month=2
   * Список платежей для конкретной ячейки таблицы.
   */
  app.get('/api/payments/cell', async (req, reply) => {
    const parsed = cellSchema.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid query', details: parsed.error.flatten() }
    }
    const { category, type, year, month } = parsed.data
    const items = await paymentsService.getCellPayments(category, type, year, month)
    return { items }
  })
}
