import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { rewardsService } from './rewards.service.js'

const periodSchema = z.coerce.number().int().min(200001).max(209912).refine(p => p % 100 >= 1 && p % 100 <= 12)

const fail = (reply: { code: (c: number) => unknown }, e: unknown) => {
  reply.code(400)
  return { error: e instanceof Error ? e.message : String(e) }
}

export const megafonRewardsRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/megafon/rewards/preview?period=202609 — что будет начислено. */
  app.get('/api/megafon/rewards/preview', async (req, reply) => {
    const p = periodSchema.safeParse((req.query as { period?: string }).period)
    if (!p.success) { reply.code(400); return { error: 'invalid period' } }
    try { return await rewardsService.preview(p.data) } catch (e) { return fail(reply, e) }
  })

  /** POST /api/megafon/rewards/accrue {period, dealIds} — записать в amoCRM. */
  app.post('/api/megafon/rewards/accrue', async (req, reply) => {
    const body = z.object({ period: periodSchema, dealIds: z.array(z.number().int()).min(1) }).safeParse(req.body)
    if (!body.success) { reply.code(400); return { error: 'invalid body' } }
    try { return await rewardsService.accrue(body.data.period, body.data.dealIds) } catch (e) { return fail(reply, e) }
  })

  /** GET /api/megafon/rewards/payouts?period=202609 — начисленные сделки. */
  app.get('/api/megafon/rewards/payouts', async (req, reply) => {
    const raw = (req.query as { period?: string }).period
    const p = raw ? periodSchema.safeParse(raw) : null
    if (p && !p.success) { reply.code(400); return { error: 'invalid period' } }
    try { return await rewardsService.payouts(p?.success ? p.data : null) } catch (e) { return fail(reply, e) }
  })

  /** POST /api/megafon/rewards/paid {dealIds, paid} — отметка «выплачено». */
  app.post('/api/megafon/rewards/paid', async (req, reply) => {
    const body = z.object({ dealIds: z.array(z.number().int()).min(1), paid: z.boolean() }).safeParse(req.body)
    if (!body.success) { reply.code(400); return { error: 'invalid body' } }
    try { return await rewardsService.setPaid(body.data.dealIds, body.data.paid) } catch (e) { return fail(reply, e) }
  })
}
