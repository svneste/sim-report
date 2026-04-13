import { db } from '../../db/client.js'
import { payments } from '../../db/schema.js'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { sql, eq, and } from 'drizzle-orm'

// ===================== B24 FIELD CONFIG =====================

const ENTITY_TYPE_ID = 1032
const F_AMOUNT   = 'opportunity'
const F_DATE     = 'ufCrm19_1730893567094'   // Дата проведённой оплаты
const F_TYPE     = 'ufCrm19_1730893551691'   // Тип: Доход / Затраты
const F_CATEGORY = 'ufCrm19_1730893691'      // Статья платежа

// Enum ID → label (из crm.item.fields)
const TYPE_MAP: Record<string, string> = {
  '939': 'income',
  '941': 'expense',
}

const CATEGORY_MAP: Record<string, string> = {
  '943': 'Долгосрочные проекты',
  '945': 'Разовые проекты',
  '947': 'Агентсткие услуги',
  '949': 'Депозит',
  '951': 'Зарплата',
  '953': 'Оплата подрядчикам',
  '955': 'Возврат',
  '957': 'Комиссия',
  '959': 'Реклама',
  '961': 'Сервисы',
  '963': 'Налоги и взносы',
  '965': 'Нераспределенные расходы',
  '967': 'Перевод',
  '969': 'Ввод денег',
  '971': 'Дивиденды',
  '973': 'Лицензии amoCRM',
  '975': 'Лицензии Битрикс24',
  '977': 'Техническое сопровождение',
  '979': 'Внедрение amoCRM / Консалтинг',
  '981': 'Внедрение Битрикс24 / Консалтинг',
  '983': 'amoCRM Виджеты лицензии',
  '985': 'Разработка',
  '987': 'Офис, содержание офиса',
  '1439': 'МегаФон 1-01072015/АСМ',
  '1441': 'МегаФон 1-01.05.2018/АС/B2B',
  '1443': 'МегаФон б/н 01.08.2025',
}

const MEGAFON_CATEGORIES = new Set([
  'МегаФон 1-01072015/АСМ',
  'МегаФон 1-01.05.2018/АС/B2B',
  'МегаФон б/н 01.08.2025',
])

// ===================== B24 REST API =====================

interface B24Item { [key: string]: unknown }

async function fetchB24Page(domain: string, token: string, start: number): Promise<{ items: B24Item[]; next?: number; total: number }> {
  const params = new URLSearchParams({
    entityTypeId: String(ENTITY_TYPE_ID),
    'order[id]': 'ASC',
    'select[]': 'id',
    start: String(start),
  })
  // Multiple select[] params
  const selectFields = ['id', 'title', F_AMOUNT, F_DATE, 'begindate', F_TYPE, F_CATEGORY]
  const selectStr = selectFields.map(f => `select[]=${encodeURIComponent(f)}`).join('&')
  const url = `https://${domain}/rest/crm.item.list?auth=${encodeURIComponent(token)}&entityTypeId=${ENTITY_TYPE_ID}&order[id]=ASC&start=${start}&${selectStr}`

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`B24 API ${res.status}: ${await res.text()}`)

  const json = await res.json() as { result?: { items?: B24Item[] }; next?: number; total?: number; error?: string; error_description?: string }
  if (json.error) throw new Error(`B24 error: ${json.error} — ${json.error_description}`)

  return {
    items: json.result?.items ?? [],
    next: json.next,
    total: json.total ?? 0,
  }
}

/** Определяет typeId смарт-процесса по entityTypeId через crm.type.list. */
async function fetchSmartProcessTypeId(domain: string, token: string): Promise<number | null> {
  const url = `https://${domain}/rest/crm.type.list?auth=${encodeURIComponent(token)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return null
  const json = await res.json() as { result?: { types?: Array<{ id: number; entityTypeId: number }> } }
  const found = json.result?.types?.find(t => t.entityTypeId === ENTITY_TYPE_ID)
  return found?.id ?? null
}

// Кэш typeId — определяется один раз при первом синке
let cachedTypeId: number | null = null

async function fetchAllB24Items(domain: string, token: string): Promise<B24Item[]> {
  const all: B24Item[] = []
  let start = 0

  while (true) {
    const page = await fetchB24Page(domain, token, start)
    all.push(...page.items)
    logger.info(`[payments] page start=${start}: ${page.items.length} items, total=${page.total}`)
    if (page.next == null || page.items.length === 0) break
    start = page.next
  }

  logger.info(`[payments] fetched ${all.length} items from B24`)
  return all
}

// ===================== PARSING =====================

function parseItem(item: B24Item): { id: number; amount: number; type: string; category: string; paymentDate: string; title: string } | null {
  const id = Number(item.id)
  if (!id) return null

  const amount = Math.round(Number(item[F_AMOUNT]) || 0)
  if (amount === 0) return null

  const rawType = String(item[F_TYPE] ?? '')
  const type = TYPE_MAP[rawType]
  if (!type) return null

  const rawCat = String(item[F_CATEGORY] ?? '')
  const category = CATEGORY_MAP[rawCat] || rawCat || 'Без категории'

  // Дата оплаты, fallback на begindate
  const rawDate = (item[F_DATE] ?? item.begindate ?? '') as string
  if (!rawDate) return null
  const paymentDate = rawDate.slice(0, 10) // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return null

  const title = String(item.title ?? '')

  return { id, amount, type, category, paymentDate, title }
}

// ===================== SERVICE =====================

export const paymentsService = {
  /** Синхронизирует все платежи из B24 в PostgreSQL. */
  async sync(domain: string, accessToken: string) {
    const startedAt = Date.now()

    // Определяем typeId для корректных ссылок на элементы
    if (cachedTypeId == null) {
      cachedTypeId = await fetchSmartProcessTypeId(domain, accessToken)
      logger.info(`[payments] smart process typeId: ${cachedTypeId}`)
    }

    const items = await fetchAllB24Items(domain, accessToken)

    let upserted = 0
    let skipped = 0

    for (const item of items) {
      const parsed = parseItem(item)
      if (!parsed) { skipped++; continue }

      await db.insert(payments).values({
        id: parsed.id,
        amount: parsed.amount,
        type: parsed.type,
        category: parsed.category,
        paymentDate: parsed.paymentDate,
        title: parsed.title,
        raw: item as object,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: payments.id,
        set: {
          amount: sql`excluded.amount`,
          type: sql`excluded.type`,
          category: sql`excluded.category`,
          paymentDate: sql`excluded.payment_date`,
          title: sql`excluded.title`,
          raw: sql`excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      })
      upserted++
    }

    const elapsed = Date.now() - startedAt
    logger.info(`[payments] sync done: ${upserted} upserted, ${skipped} skipped, ${elapsed}ms`)
    return { upserted, skipped, elapsed }
  },

  /** Возвращает агрегированные данные по платежам за год. */
  async getByYear(year: number) {
    const rows = await db
      .select({
        type: payments.type,
        category: payments.category,
        paymentDate: payments.paymentDate,
        amount: payments.amount,
      })
      .from(payments)
      .where(sql`extract(year from ${payments.paymentDate}) = ${year}`)

    // Агрегация по категориям и месяцам
    const incomeMap  = new Map<string, Record<number, number>>()
    const expenseMap = new Map<string, Record<number, number>>()

    for (const r of rows) {
      const month = new Date(r.paymentDate + 'T00:00:00').getMonth() + 1
      const map = r.type === 'income' ? incomeMap : expenseMap
      if (!map.has(r.category)) map.set(r.category, {})
      const months = map.get(r.category)!
      months[month] = (months[month] ?? 0) + r.amount
    }

    function toRows(map: Map<string, Record<number, number>>) {
      return Array.from(map.entries())
        .map(([category, months]) => ({
          category,
          months,
          total: Object.values(months).reduce((s, v) => s + v, 0),
          isMegafon: MEGAFON_CATEGORIES.has(category),
        }))
        .sort((a, b) => b.total - a.total)
    }

    const income  = toRows(incomeMap)
    const expense = toRows(expenseMap)

    return { year, income, expense }
  },

  /** Список платежей для конкретной ячейки (категория + тип + год + месяц). */
  async getCellPayments(category: string, type: string, year: number, month: number) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const toMonth = month === 12 ? 1 : month + 1
    const toYear  = month === 12 ? year + 1 : year
    const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01`

    const rows = await db
      .select({
        id: payments.id,
        title: payments.title,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        category: payments.category,
      })
      .from(payments)
      .where(and(
        eq(payments.category, category),
        eq(payments.type, type),
        sql`${payments.paymentDate} >= ${from}::date`,
        sql`${payments.paymentDate} < ${to}::date`,
      ))
      .orderBy(payments.paymentDate)

    const typeId = cachedTypeId ?? 19
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      amount: r.amount,
      date: r.paymentDate,
      url: `https://${config.BITRIX24_DOMAIN}/crm/type/${typeId}/details/${r.id}/`,
    }))
  },
}
