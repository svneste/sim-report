import cron from 'node-cron'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { syncService } from './sync.service.js'
import { syncStatusEvents } from './status-events.sync.js'

let lastRunAtSec: number | null = null
let running = false

export function startSyncCron(): void {
  if (!cron.validate(config.SYNC_CRON)) {
    logger.warn('SYNC_CRON invalid, scheduler not started', config.SYNC_CRON)
    return
  }
  cron.schedule(config.SYNC_CRON, async () => {
    if (running) {
      logger.warn('sync already running, skip')
      return
    }
    running = true
    try {
      const since = lastRunAtSec ?? undefined
      const res = await syncService.run(since)
      lastRunAtSec = Math.floor(res.startedAt.getTime() / 1000) - 60 // overlap 60s

      // После основного sync — догоняем историю переходов между этапами.
      // У него свой независимый watermark внутри модуля, при первом
      // запуске сделает backfill за 90 дней.
      try {
        await syncStatusEvents()
      } catch (e) {
        logger.error('status-events sync failed', e)
      }
    } catch (e) {
      logger.error('sync failed', e)
    } finally {
      running = false
    }
  })
  logger.info('sync cron scheduled', config.SYNC_CRON)
}
