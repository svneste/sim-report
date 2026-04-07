import type { AmoLead } from '../amocrm/client.js'
import { config } from '../../core/config.js'

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
      const d = new Date(sec * 1000)
      return toIsoDate(d)
    }
    case 'text': {
      // Допустим различные текстовые форматы — отдадим как есть, если парсится
      const d = new Date(String(raw))
      if (Number.isNaN(d.getTime())) return null
      return toIsoDate(d)
    }
  }
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
