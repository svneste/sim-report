import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './core/config.js'
import { logger } from './core/logger.js'
import { simReportRoutes } from './modules/sim-report/sim-report.routes.js'
import { associationsReportRoutes } from './modules/associations-report/associations-report.routes.js'
import { startSyncCron } from './modules/sync/sync.cron.js'
import { syncService } from './modules/sync/sync.service.js'
import { usersRoutes } from './modules/users/users.routes.js'

const app = Fastify({ logger: false })

await app.register(cors, { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') })

app.get('/health', async () => ({ ok: true }))

// Ручной запуск синхронизации.
// Без параметров — полный sync (тянет всю воронку, тяжело).
// ?hours=N — инкрементальный sync за последние N часов (для кнопки "Обновить" в UI).
app.post('/api/sync/run', async (req) => {
  const q = req.query as { hours?: string } | undefined
  const hours = q?.hours ? Number(q.hours) : NaN
  const sinceSec = Number.isFinite(hours) && hours > 0
    ? Math.floor(Date.now() / 1000) - Math.floor(hours * 3600)
    : undefined
  const res = await syncService.run(sinceSec)
  return res
})

await app.register(simReportRoutes)
await app.register(associationsReportRoutes)
await app.register(usersRoutes)

app.listen({ port: config.PORT, host: config.HOST })
  .then(() => {
    logger.info(`backend listening on http://${config.HOST}:${config.PORT}`)
    startSyncCron()
  })
  .catch((err) => {
    logger.error('failed to start', err)
    process.exit(1)
  })
