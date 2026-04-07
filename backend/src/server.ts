import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './core/config.js'
import { logger } from './core/logger.js'
import { simReportRoutes } from './modules/sim-report/sim-report.routes.js'
import { startSyncCron } from './modules/sync/sync.cron.js'
import { syncService } from './modules/sync/sync.service.js'
import { usersRoutes } from './modules/users/users.routes.js'

const app = Fastify({ logger: false })

await app.register(cors, { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') })

app.get('/health', async () => ({ ok: true }))

// Ручной запуск синхронизации (полезно для отладки и кнопки в админке)
app.post('/api/sync/run', async () => {
  const res = await syncService.run()
  return res
})

await app.register(simReportRoutes)
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
