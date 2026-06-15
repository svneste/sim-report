import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { yandexService, type SiteInput } from './yandex.service.js'

// Тело для создания/обновления сайта. counterId/goalId/* приходят числами;
// пустые опциональные поля нормализуем в null.
const siteSchema = z.object({
  name:              z.string().min(1, 'Укажите название сайта'),
  counterId:         z.coerce.number().int().positive('Некорректный номер счётчика'),
  goalId:            z.coerce.number().int().positive().nullish(),
  domain:            z.string().trim().nullish(),
  amocrmPipelineId:  z.coerce.number().int().positive().nullish(),
  amocrmPageFieldId: z.coerce.number().int().positive().nullish(),
})

// Тело для ручного названия клиента. name может быть пустым (сброс).
const clientNameSchema = z.object({
  slug: z.string().min(1, 'Пустой slug'),
  name: z.string().max(120, 'Слишком длинное название'),
})

function toInput(body: z.infer<typeof siteSchema>): SiteInput {
  return {
    name:              body.name.trim(),
    counterId:         body.counterId,
    goalId:            body.goalId ?? null,
    domain:            body.domain ? body.domain : null,
    amocrmPipelineId:  body.amocrmPipelineId ?? null,
    amocrmPageFieldId: body.amocrmPageFieldId ?? null,
  }
}

export const yandexRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/yandex/sites — список сайтов. */
  app.get('/api/yandex/sites', async () => {
    return yandexService.listSites()
  })

  /** POST /api/yandex/sites — создать сайт. */
  app.post('/api/yandex/sites', async (req, reply) => {
    const parsed = siteSchema.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues[0]?.message ?? 'Некорректные данные' }
    }
    return yandexService.createSite(toInput(parsed.data))
  })

  /** PATCH /api/yandex/sites/:id — изменить сайт. */
  app.patch('/api/yandex/sites/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    if (!Number.isFinite(id)) { reply.code(400); return { error: 'invalid id' } }
    const parsed = siteSchema.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues[0]?.message ?? 'Некорректные данные' }
    }
    try {
      return await yandexService.updateSite(id, toInput(parsed.data))
    } catch (e) {
      reply.code(404)
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** DELETE /api/yandex/sites/:id — удалить сайт. */
  app.delete('/api/yandex/sites/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    if (!Number.isFinite(id)) { reply.code(400); return { error: 'invalid id' } }
    return yandexService.deleteSite(id)
  })

  /**
   * PUT /api/yandex/sites/:id/client-name — задать/очистить ручное название клиента.
   * Тело: { slug: string, name: string }. Пустое name сбрасывает название.
   */
  app.put('/api/yandex/sites/:id/client-name', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    if (!Number.isFinite(id)) { reply.code(400); return { error: 'invalid id' } }
    const parsed = clientNameSchema.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400)
      return { error: parsed.error.issues[0]?.message ?? 'Некорректные данные' }
    }
    try {
      return await yandexService.setClientName(id, parsed.data.slug, parsed.data.name)
    } catch (e) {
      reply.code(404)
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  /**
   * GET /api/yandex/report?siteId=1&from=2026-05-01&to=2026-05-31
   * Отчёт по страницам. Без from/to — последние 30 дней.
   */
  app.get('/api/yandex/report', async (req, reply) => {
    const q = req.query as { siteId?: string; from?: string; to?: string }
    const siteId = Number(q.siteId)
    if (!Number.isFinite(siteId)) { reply.code(400); return { error: 'invalid siteId' } }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if ((q.from && !dateRe.test(q.from)) || (q.to && !dateRe.test(q.to))) {
      reply.code(400)
      return { error: 'from/to должны быть в формате YYYY-MM-DD' }
    }

    try {
      return await yandexService.getReport(siteId, q.from, q.to)
    } catch (e) {
      reply.code(400)
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
}
