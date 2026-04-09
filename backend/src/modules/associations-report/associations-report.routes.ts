import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { associationsReportService } from './associations-report.service.js'

const querySchema = z.object({
  year:     z.coerce.number().int().min(2000).max(2100),
  month:    z.coerce.number().int().min(1).max(12),
  limit:    z.coerce.number().int().min(1).max(100).default(15),
  offset:   z.coerce.number().int().min(0).default(0),
  // Список выбранных названий объединений (через ||| как разделитель,
  // чтобы не конфликтовать с запятыми внутри названий).
  selected: z.string().optional(),
})

const yearlyQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
})

export const associationsReportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/associations-report', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid query', details: parsed.error.flatten() }
    }
    const selected = parsed.data.selected
      ? parsed.data.selected.split('|||').map(s => s.trim()).filter(Boolean)
      : []
    return associationsReportService.getMonthly(
      parsed.data.year,
      parsed.data.month,
      parsed.data.limit,
      parsed.data.offset,
      selected,
    )
  })

  app.get('/api/associations-report/yearly', async (req, reply) => {
    const parsed = yearlyQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400)
      return { error: 'invalid query', details: parsed.error.flatten() }
    }
    return associationsReportService.getYearly(parsed.data.year)
  })
}
