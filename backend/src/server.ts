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
import { paymentsRoutes } from './modules/payments/payments.routes.js'
import { megafonRoutes } from './modules/megafon/megafon.routes.js'
import multipart from '@fastify/multipart'
import { bitrix24AuthHook } from './modules/bitrix24-auth/b24-auth.hook.js'
import { sql } from 'drizzle-orm'
import { db } from './db/client.js'

const app = Fastify({ logger: false })

await app.register(cors, { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') })
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB

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
  const res = await syncStatusEvents()
  // Заодно отдадим количество строк в таблице — удобно проверять из UI/curl
  const count = await db.execute(sql`select count(*)::int as c from lead_status_transitions`)
  const total = (count as unknown as { rows?: Array<{ c: number }> })?.rows?.[0]?.c
              ?? (Array.isArray(count) ? (count[0] as { c: number })?.c : undefined)
  return { ...res, totalRowsAfter: total ?? null }
})

// Лёгкая диагностика без рестарта sync'а — показывает текущее состояние таблицы:
// сколько строк всего, разрез по статусам, последние occurred_at.
app.get('/api/sync/status-events/debug', async () => {
  const totalRes = await db.execute(sql`select count(*)::int as c from lead_status_transitions`)
  const totalRows = (totalRes as unknown as { rows?: Array<{ c: number }> })?.rows?.[0]?.c
                 ?? (Array.isArray(totalRes) ? (totalRes[0] as { c: number })?.c : 0)

  const byStatusRes = await db.execute(sql`
    select status_id, count(*)::int as c, max(occurred_at) as last_occurred
    from lead_status_transitions
    group by status_id
    order by c desc
  `)
  const byStatus = (byStatusRes as unknown as { rows?: unknown[] })?.rows
                ?? (Array.isArray(byStatusRes) ? (byStatusRes as unknown[]) : [])

  return { totalRows, byStatus }
})

await app.register(simReportRoutes)
await app.register(associationsReportRoutes)
await app.register(usersRoutes)
await app.register(bitrix24UsersRoutes)
await app.register(paymentsRoutes)
await app.register(megafonRoutes)

app.listen({ port: config.PORT, host: config.HOST })
  .then(() => {
    logger.info(`backend listening on http://${config.HOST}:${config.PORT}`)
    startSyncCron()
  })
  .catch((err) => {
    logger.error('failed to start', err)
    process.exit(1)
  })
