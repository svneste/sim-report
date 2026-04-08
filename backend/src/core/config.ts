import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),

  AMOCRM_SUBDOMAIN: z.string().min(1),
  AMOCRM_CLIENT_ID: z.string().default(''),
  AMOCRM_CLIENT_SECRET: z.string().default(''),
  AMOCRM_REDIRECT_URI: z.string().default(''),
  AMOCRM_AUTH_CODE: z.string().default(''),

  AMOCRM_PIPELINE_ID: z.coerce.number(),
  AMOCRM_SIM_FIELD_ID: z.coerce.number(),
  AMOCRM_SIM_FIELD_TYPE: z.enum(['date', 'date_time', 'text']).default('date'),

  SYNC_CRON: z.string().default('*/15 * * * *'),

  // Домен портала Bitrix24, в iframe которого живёт SPA. Используется
  // и как whitelist для CSP frame-ancestors в nginx, и как URL для
  // верификации auth-token из BX24.js на бэке (см. b24-auth.hook).
  BITRIX24_DOMAIN: z.string().default('melabs.bitrix24.ru'),

  // Список ID сотрудников amoCRM, которых нужно скрывать в отчётах (через запятую).
  // Например, руководители — у них могут быть оформления, но в календаре им не место.
  REPORT_EXCLUDED_USER_IDS: z.string().default(''),
})

const parsed = schema.parse(process.env)

export const config = {
  ...parsed,
  reportExcludedUserIds: parsed.REPORT_EXCLUDED_USER_IDS
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isFinite(n)),
}
export type AppConfig = typeof config
