import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { simReportService } from './sim-report.service.js'

const querySchema = z.object({
  year:  z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

const dealsQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
  date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

export const simReportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/sim-report', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid query', details: parsed.error.flatten() }
    }
    return simReportService.getMonthly(parsed.data.year, parsed.data.month)
  })

  app.get('/api/sim-report/deals', async (req, reply) => {
    const parsed = dealsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid query', details: parsed.error.flatten() }
    }
    const deals = await simReportService.getDealsForCell(parsed.data.userId, parsed.data.date)
    return { deals }
  })
}
