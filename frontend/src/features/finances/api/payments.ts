/**
 * Загрузка платежей из смарт-процесса «Платежи» (entityTypeId 1032).
 *
 * Данные тянутся напрямую через BX24.callMethod('crm.item.list') —
 * бэкенд не нужен, т.к. SPA и так живёт в iframe Bitrix24.
 *
 * ⚠️  МАППИНГ ПОЛЕЙ:
 *     Подставьте реальные UF-имена кастомных полей вашего смарт-процесса.
 *     Чтобы узнать имена полей, вызовите в консоли браузера:
 *       window.__discoverPaymentFields()
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===================== КОНФИГУРАЦИЯ ПОЛЕЙ =====================

const ENTITY_TYPE_ID = 1032

/** Поле с суммой (стандартное CRM-поле) */
const F_AMOUNT = 'opportunity'

/** Поле с датой платежа */
const F_DATE = 'begindate'

/**
 * Кастомное поле — тип: «Доход» / «Затраты».
 * Если это список (enumeration), значения резолвятся автоматически.
 */
const F_TYPE = 'ufCrm17_1234567890'

/** Кастомное поле — категория: «Лицензии», «Консалтинг», … */
const F_CATEGORY = 'ufCrm17_1234567891'

/** Текстовые значения типа */
const V_INCOME  = 'Доход'
const V_EXPENSE = 'Затраты'

/**
 * Категории, которые относятся к направлению МегаФон.
 * Всё остальное считается CRM-направлением.
 */
export const MEGAFON_CATEGORIES = new Set<string>([
  // TODO: вписать реальные названия, например:
  // 'Подключение МегаФон',
  // 'SIM МегаФон',
  // 'Абонентское обслуживание',
])

// ===================== ТИПЫ =====================

export interface Payment {
  id:       number
  date:     Date
  amount:   number
  type:     'income' | 'expense'
  category: string
}

export interface CategoryMonthly {
  category: string
  months:   Record<number, number>   // month (1-12) → сумма
  total:    number
}

export interface FinancesData {
  year:           number
  income:         CategoryMonthly[]
  expense:        CategoryMonthly[]
  incomeTotal:    Record<number, number>
  expenseTotal:   Record<number, number>
  incomeTotalYear:  number
  expenseTotalYear: number
}

// ===================== FETCHING =====================

interface B24Item { [key: string]: any }

function bx24() {
  return window.BX24!
}

/** Загружает ВСЕ элементы смарт-процесса 1032 с пагинацией (50 шт/запрос). */
async function fetchAllItems(): Promise<B24Item[]> {
  const all: B24Item[] = []

  return new Promise((resolve, reject) => {
    const handle = (res: any) => {
      const err = res.error()
      if (err) { reject(new Error(`crm.item.list error: ${JSON.stringify(err)}`)); return }
      const result = res.data()
      const items = result?.items ?? result ?? []
      if (Array.isArray(items)) all.push(...items)

      const next = res.next()
      if (next && typeof next.then === 'function') {
        (next as Promise<any>).then(handle).catch(reject)
      } else {
        resolve(all)
      }
    }

    bx24().callMethod(
      'crm.item.list',
      {
        entityTypeId: ENTITY_TYPE_ID,
        select: ['id', 'title', F_AMOUNT, F_DATE, F_TYPE, F_CATEGORY],
        order: { [F_DATE]: 'ASC' },
      },
      handle,
    )
  })
}

/** Загружает определения полей — нужно для резолва enum-списков. */
async function fetchFieldDefs(): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    bx24().callMethod(
      'crm.item.fields',
      { entityTypeId: ENTITY_TYPE_ID },
      (res: any) => {
        const err = res.error()
        if (err) { reject(new Error(`crm.item.fields error: ${JSON.stringify(err)}`)); return }
        const data = res.data()
        resolve(data?.fields ?? data ?? {})
      },
    )
  })
}

/** Строит карту enum ID → label для указанного поля. */
function buildEnumMap(fields: Record<string, any>, fieldName: string): Map<number | string, string> {
  const map = new Map<number | string, string>()
  const def = fields[fieldName]
  if (!def?.items) return map
  for (const item of def.items) {
    if (item.ID != null && item.VALUE != null) {
      map.set(Number(item.ID), String(item.VALUE))
      map.set(String(item.ID), String(item.VALUE))
    }
  }
  return map
}

function resolveValue(raw: any, enumMap: Map<number | string, string>): string {
  if (raw == null) return ''
  // enum ID → label
  if (enumMap.size > 0) {
    const resolved = enumMap.get(raw) ?? enumMap.get(String(raw))
    if (resolved) return resolved
  }
  // уже строка
  if (typeof raw === 'string') return raw
  // массив (мульти-список)
  if (Array.isArray(raw)) {
    return raw.map(v => enumMap.get(v) ?? enumMap.get(String(v)) ?? String(v)).join(', ')
  }
  return String(raw)
}

// ===================== ПАРСИНГ + АГРЕГАЦИЯ =====================

function parsePayments(
  items: B24Item[],
  typeEnumMap: Map<number | string, string>,
  catEnumMap: Map<number | string, string>,
): Payment[] {
  const payments: Payment[] = []

  for (const item of items) {
    const rawDate = item[F_DATE] ?? item.begindate ?? item.createdTime
    if (!rawDate) continue

    const date = new Date(rawDate)
    if (isNaN(date.getTime())) continue

    const amount = Number(item[F_AMOUNT]) || 0
    if (amount === 0) continue

    const rawType = resolveValue(item[F_TYPE], typeEnumMap)
    let type: 'income' | 'expense'
    if (rawType.includes(V_INCOME) || rawType.toLowerCase().includes('доход')) {
      type = 'income'
    } else if (rawType.includes(V_EXPENSE) || rawType.toLowerCase().includes('затрат') || rawType.toLowerCase().includes('расход')) {
      type = 'expense'
    } else {
      continue // неизвестный тип — пропускаем
    }

    const category = resolveValue(item[F_CATEGORY], catEnumMap) || 'Без категории'

    payments.push({ id: item.id, date, amount, type, category })
  }

  return payments
}

function aggregateByYear(payments: Payment[], year: number): FinancesData {
  const incomeMap  = new Map<string, Record<number, number>>()
  const expenseMap = new Map<string, Record<number, number>>()

  for (const p of payments) {
    if (p.date.getFullYear() !== year) continue
    const month = p.date.getMonth() + 1
    const map = p.type === 'income' ? incomeMap : expenseMap

    if (!map.has(p.category)) map.set(p.category, {})
    const months = map.get(p.category)!
    months[month] = (months[month] ?? 0) + p.amount
  }

  function toRows(map: Map<string, Record<number, number>>): CategoryMonthly[] {
    return Array.from(map.entries())
      .map(([category, months]) => ({
        category,
        months,
        total: Object.values(months).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }

  const income  = toRows(incomeMap)
  const expense = toRows(expenseMap)

  const incomeTotal:  Record<number, number> = {}
  const expenseTotal: Record<number, number> = {}
  for (const r of income)  for (const [m, v] of Object.entries(r.months)) incomeTotal[+m]  = (incomeTotal[+m]  ?? 0) + v
  for (const r of expense) for (const [m, v] of Object.entries(r.months)) expenseTotal[+m] = (expenseTotal[+m] ?? 0) + v

  return {
    year,
    income,
    expense,
    incomeTotal,
    expenseTotal,
    incomeTotalYear:  income.reduce((s, r) => s + r.total, 0),
    expenseTotalYear: expense.reduce((s, r) => s + r.total, 0),
  }
}

// ===================== PUBLIC API =====================

let cachedPayments: Payment[] | null = null
let cacheKey = ''

/**
 * Загружает все платежи из B24 (с кэшированием в рамках сессии)
 * и агрегирует по указанному году.
 */
export async function fetchFinancesData(year: number, forceReload = false): Promise<FinancesData> {
  const key = 'payments-v1'
  if (!cachedPayments || cacheKey !== key || forceReload) {
    const [items, fields] = await Promise.all([fetchAllItems(), fetchFieldDefs()])
    const typeEnumMap = buildEnumMap(fields, F_TYPE)
    const catEnumMap  = buildEnumMap(fields, F_CATEGORY)
    cachedPayments = parsePayments(items, typeEnumMap, catEnumMap)
    cacheKey = key
  }
  return aggregateByYear(cachedPayments, year)
}

/**
 * Возвращает true, если категория относится к направлению МегаФон.
 */
export function isMegafonCategory(category: string): boolean {
  return MEGAFON_CATEGORIES.has(category)
}

/**
 * Фильтрует FinancesData — оставляет только нужные категории.
 */
export function filterFinancesData(
  data: FinancesData,
  predicate: (category: string) => boolean,
): FinancesData {
  const filterRows = (rows: CategoryMonthly[]) => rows.filter(r => predicate(r.category))

  const income  = filterRows(data.income)
  const expense = filterRows(data.expense)

  const incomeTotal:  Record<number, number> = {}
  const expenseTotal: Record<number, number> = {}
  for (const r of income)  for (const [m, v] of Object.entries(r.months)) incomeTotal[+m]  = (incomeTotal[+m]  ?? 0) + v
  for (const r of expense) for (const [m, v] of Object.entries(r.months)) expenseTotal[+m] = (expenseTotal[+m] ?? 0) + v

  return {
    year: data.year,
    income,
    expense,
    incomeTotal,
    expenseTotal,
    incomeTotalYear:  income.reduce((s, r) => s + r.total, 0),
    expenseTotalYear: expense.reduce((s, r) => s + r.total, 0),
  }
}

// ===================== DISCOVERY (для настройки) =====================

/**
 * Вызовите window.__discoverPaymentFields() в консоли браузера,
 * чтобы увидеть все поля смарт-процесса и пример данных.
 */
if (typeof window !== 'undefined') {
  ;(window as any).__discoverPaymentFields = async () => {
    console.log('Загрузка полей смарт-процесса', ENTITY_TYPE_ID, '...')

    const fields = await fetchFieldDefs()
    console.group('📋 Поля смарт-процесса')
    for (const [name, def] of Object.entries(fields)) {
      const d = def as any
      console.log(
        `${name}  —  ${d.title ?? ''}  [${d.type}]`,
        d.items ? `(enum: ${d.items.map((i: any) => `${i.ID}=${i.VALUE}`).join(', ')})` : '',
      )
    }
    console.groupEnd()

    console.log('\nЗагрузка первых 5 элементов...')
    const items = await new Promise<any[]>((resolve, reject) => {
      bx24().callMethod(
        'crm.item.list',
        { entityTypeId: ENTITY_TYPE_ID, select: ['*'], order: { id: 'DESC' }, filter: {} },
        (res: any) => {
          const err = res.error()
          if (err) { reject(err); return }
          const data = res.data()
          resolve((data?.items ?? data ?? []).slice(0, 5))
        },
      )
    })
    console.group('📄 Примеры элементов')
    items.forEach((item, i) => { console.log(`#${i + 1}`, item) })
    console.groupEnd()

    console.log('\n✅ Скопируйте нужные имена полей в payments.ts (константы F_TYPE, F_CATEGORY и т.д.)')
  }
}
