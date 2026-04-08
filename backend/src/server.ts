import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './core/config.js'
import { logger } from './core/logger.js'
import { simReportRoutes } from './modules/sim-report/sim-report.routes.js'
import { associationsReportRoutes } from './modules/associations-report/associations-report.routes.js'
import { startSyncCron } from './modules/sync/sync.cron.js'
import { syncService } from './modules/sync/sync.service.js'
import { resetStatusEventsWatermark, syncStatusEvents } from './modules/sync/status-events.sync.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { bitrix24UsersRoutes } from './modules/bitrix24-users/bitrix24-users.routes.js'
import { bitrix24AuthHook } from './modules/bitrix24-auth/b24-auth.hook.js'

const app = Fastify({ logger: false })

await app.register(cors, { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') })

// Жёсткая защита /api/* — только запросы с валидным BX24 access_token.
// Хук сам пропускает /health и всё, что не /api/*.
app.addHook('onRequest', bitrix24AuthHook)

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
  // Догоняем историю переходов — нужна для графика "включения по дате
  // перехода". Если вызов упал — sync основных данных не валим.
  try {
    await syncStatusEvents()
  } catch (e) {
    logger.error('status-events sync failed during /api/sync/run', e)
  }
  return res
})

// Полный пересбор истории переходов за последние 90 дней.
// Сбрасывает watermark и тащит все события заново. Дёргать руками,
// если кажется, что в графике "включения" есть пробелы.
app.post('/api/sync/status-events/backfill', async () => {
  resetStatusEventsWatermark()
  return await syncStatusEvents()
})

await app.register(simReportRoutes)
await app.register(associationsReportRoutes)
await app.register(usersRoutes)
await app.register(bitrix24UsersRoutes)

app.listen({ port: config.PORT, host: config.HOST })
  .then(() => {
    logger.info(`backend listening on http://${config.HOST}:${config.PORT}`)
    startSyncCron()
  })
  .catch((err) => {
    logger.error('failed to start', err)
    process.exit(1)
  })
