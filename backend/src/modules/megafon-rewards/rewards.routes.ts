import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { rewardsService, warmRewardsCache } from './rewards.service.js'
import { logger } from '../../core/logger.js'

const periodSchema = z.coerce.number().int().min(200001).max(209912).refine(p => p % 100 >= 1 && p % 100 <= 12)

const fail = (reply: { code: (c: number) => unknown }, e: unknown) => {
  reply.code(400)
  return { error: e instanceof Error ? e.message : String(e) }
}

export const megafonRewardsRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/megafon/rewards/preview?period=202609 — что будет начислено. */
  app.get('/api/megafon/rewards/preview', async (req, reply) => {
    const q = req.query as { period?: string; refresh?: string }
    const p = periodSchema.safeParse(q.period)
    if (!p.success) { reply.code(400); return { error: 'invalid period' } }
    try { return await rewardsService.preview(p.data, q.refresh === '1') } catch (e) { return fail(reply, e) }
  })

  /** GET /api/megafon/rewards/check?months=6 — успешные сделки без начислений МегаФон. */
  app.get('/api/megafon/rewards/check', async (req, reply) => {
    const q = req.query as { months?: string; refresh?: string }
    const months = q.months ? Number(q.months) : 6
    if (!Number.isFinite(months) || months < 0 || months > 120) { reply.code(400); return { error: 'invalid months' } }
    try { return await rewardsService.check(months, q.refresh === '1') } catch (e) { return fail(reply, e) }
  })

  /** POST /api/megafon/rewards/warm — прогрев кэша сделок (дёргается при открытии вкладки). */
  app.post('/api/megafon/rewards/warm', async () => {
    warmRewardsCache().catch(e => logger.error('rewards warm failed', e))
    return { ok: true }
  })

  /** POST /api/megafon/rewards/accrue {period, dealIds, ratePct} — записать в amoCRM. */
  app.post('/api/megafon/rewards/accrue', async (req, reply) => {
    const body = z.object({ period: periodSchema, dealIds: z.array(z.number().int()).min(1), ratePct: z.number().gt(0).max(100) }).safeParse(req.body)
    if (!body.success) { reply.code(400); return { error: 'invalid body' } }
    try { return await rewardsService.accrue(body.data.period, body.data.dealIds, body.data.ratePct) } catch (e) { return fail(reply, e) }
  })

  /** GET /api/megafon/rewards/payouts?period=202609 — начисленные сделки. */
  app.get('/api/megafon/rewards/payouts', async (req, reply) => {
    const q = req.query as { period?: string; refresh?: string }
    const raw = q.period
    const p = raw ? periodSchema.safeParse(raw) : null
    if (p && !p.success) { reply.code(400); return { error: 'invalid period' } }
    try { return await rewardsService.payouts(p?.success ? p.data : null, q.refresh === '1') } catch (e) { return fail(reply, e) }
  })

  /** POST /api/megafon/rewards/paid {dealIds, paid} — отметка «выплачено». */
  app.post('/api/megafon/rewards/paid', async (req, reply) => {
    const body = z.object({ dealIds: z.array(z.number().int()).min(1), paid: z.boolean() }).safeParse(req.body)
    if (!body.success) { reply.code(400); return { error: 'invalid body' } }
    try { return await rewardsService.setPaid(body.data.dealIds, body.data.paid) } catch (e) { return fail(reply, e) }
  })
}
