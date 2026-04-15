import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { megafonService } from './megafon.service.js'

export const megafonRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/megafon/upload
   * Принимает xlsx-файл МегаФон (multipart/form-data, поле "file").
   * Парсит детальный лист и сохраняет строки в БД.
   */
  app.post('/api/megafon/upload', async (req, reply) => {
    const file = await req.file()
    if (!file) {
      reply.code(400)
      return { error: 'Файл не загружен. Отправьте xlsx в поле "file".' }
    }

    const buffer = await file.toBuffer()
    const filename = file.filename ?? 'unknown.xlsx'

    try {
      const result = await megafonService.upload(buffer, filename)
      return result
    } catch (e) {
      reply.code(400)
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  /**
   * GET /api/megafon/uploads
   * Список загруженных файлов.
   */
  app.get('/api/megafon/uploads', async () => {
    return megafonService.getUploads()
  })

  /**
   * DELETE /api/megafon/uploads/:id
   * Удалить загруженный файл и его данные.
   */
  app.delete('/api/megafon/uploads/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const numId = Number(id)
    if (!numId) { reply.code(400); return { error: 'invalid id' } }
    return megafonService.deleteUpload(numId)
  })

  /**
   * GET /api/megafon/periods
   * Список загруженных периодов.
   */
  app.get('/api/megafon/periods', async () => {
    return megafonService.getPeriods()
  })

  /**
   * GET /api/megafon/dynamics
   * Динамика вознаграждений по месяцам с разбивкой по договорам.
   */
  app.get('/api/megafon/dynamics', async () => {
    return megafonService.getDynamics()
  })

  /**
   * GET /api/megafon/report?period=202603
   * Агрегированный отчёт. Без period — по всем данным.
   */
  app.get('/api/megafon/report', async (req, reply) => {
    const q = req.query as { period?: string }
    const period = q.period ? Number(q.period) : undefined
    if (q.period && (!period || !Number.isFinite(period))) {
      reply.code(400)
      return { error: 'invalid period' }
    }
    return megafonService.getReport(period)
  })
}
