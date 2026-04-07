import type { AmoLead } from '../amocrm/client.js'
import { config } from '../../core/config.js'

/**
 * Таймзона аккаунта amoCRM. Для date-полей amoCRM хранит unix-секунды
 * полуночи в TZ аккаунта (для рос. аккаунтов это Europe/Moscow), а НЕ UTC.
 * Если форматировать такой timestamp на сервере в UTC, дата уедет на сутки назад.
 *
 * Поэтому всю конвертацию timestamp → YYYY-MM-DD делаем явно в этой TZ,
 * не полагаясь на process.env.TZ контейнера.
 */
const ACCOUNT_TZ = 'Europe/Moscow'

const TZ_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ACCOUNT_TZ,
  year:  'numeric',
  month: '2-digit',
  day:   '2-digit',
})

/**
 * Извлекает дату регистрации сим-карты из custom-поля сделки.
 * Возвращает строку YYYY-MM-DD или null, если поля нет / значение не парсится.
 *
 * Изоляция: только этот файл знает о форматах поля. Меняем тут — остальной sync не трогаем.
 */
export function extractSimDate(lead: AmoLead): string | null {
  const fields = lead.custom_fields_values
  if (!fields) return null
  const field = fields.find(f => f.field_id === config.AMOCRM_SIM_FIELD_ID)
  if (!field) return null
  const raw = field.values?.[0]?.value
  if (raw == null || raw === '') return null

  switch (config.AMOCRM_SIM_FIELD_TYPE) {
    case 'date':
    case 'date_time': {
      // amoCRM отдает unix-секунды для date / date_time
      const sec = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(sec) || sec <= 0) return null
      return tsToAccountDate(sec)
    }
    case 'text': {
      // Допустим различные текстовые форматы.
      // Если строка уже похожа на YYYY-MM-DD — вернём как есть, без TZ-конверсии.
      const s = String(raw).trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      const d = new Date(s)
      if (Number.isNaN(d.getTime())) return null
      return tsToAccountDate(Math.floor(d.getTime() / 1000))
    }
  }
}

/**
 * Форматирует unix-секунды в YYYY-MM-DD в таймзоне аккаунта amoCRM.
 * en-CA локаль гарантирует формат "2026-04-07".
 */
function tsToAccountDate(sec: number): string {
  return TZ_DATE_FORMATTER.format(new Date(sec * 1000))
}
