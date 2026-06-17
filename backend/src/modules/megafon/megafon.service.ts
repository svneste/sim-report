import * as XLSX from 'xlsx'
import { db } from '../../db/client.js'
import { megafonReportRows, megafonUploads } from '../../db/schema.js'
import { logger } from '../../core/logger.js'
import { sql, eq, and, desc } from 'drizzle-orm'

// ===================== XLSX PARSING =====================

interface ParsedRow {
  period:           number
  agent:            string
  contractId:       string | null
  clientName:       string | null
  clientInn:        string | null
  segment:          string | null
  phoneActivation:  string | null
  phoneCurrent:     string | null
  subscriberId:     string | null
  activationDate:   Date | null
  registrationDate: string | null
  tariffActivation: string | null
  tariffCurrent:    string | null
  pointOfSale:      string | null
  chargesTotal:     number | null
  chargesPrev:      number | null
  chargesMonth:     number | null
  rewardPrev:       number | null
  rewardRate:       number | null
  rewardMonth:      number | null
}

/** Относит строку к договору по «Имя схемы» (поле внутри файла):
 *    схема содержит «Унификация»/«B2B» → договор «1» (1-01072015/АСМ);
 *    прочее (B2X, Фикс, …)            → договор «2» (1-01.05.2018/АС/B2B).
 *  Это даёт чистое разделение 100%/0% (проверено на выгрузках), в отличие от
 *  «Контрагента»/«Точки продаж», которые внутри файла перемешаны. */
function schemeVotesContract1(scheme: string | null): boolean {
  if (!scheme) return false
  const s = scheme.toLowerCase()
  return s.includes('унификац') || s.includes('b2b')
}

/** Запасное определение договора по имени файла (если по данным не вышло).
 *  Распознаёт помесячные имена и короткие «1.xlsx»/«2.xlsx».
 *  Примеры:
 *    «Договор № 1-01072015:АСМ.xlsx»      → «1» (договор 1-01072015/АСМ)
 *    «Договор № 1-01.05.2018:АС:B2B.xlsx» → «2» (договор 1-01.05.2018/АС/B2B)
 *    «1.xlsx» → «1», «2.xlsx» → «2», «...pscs_id_123.xlsx» → «123». */
function extractContractId(filename: string): string | null {
  // Убираем расширение, берём имя файла без пути
  const stem = filename.replace(/\.[^.]+$/, '').replace(/^.*[\\/]/, '')

  // Маркеры договоров в имени файла (проверяем ДО общего числа,
  // т.к. имена «Договор № 1-...» начинаются с цифры 1 для обоих договоров)
  if (/2015|АСМ/i.test(stem)) return '1'           // договор 1-01072015/АСМ
  if (/2018|B2B/i.test(stem)) return '2'           // договор 1-01.05.2018/АС/B2B

  // pscs_id_XXXXX — явный идентификатор точки продаж
  const pscs = stem.match(/pscs_id_(\d+)/)
  if (pscs) return pscs[1]

  // Короткие имена «1.xlsx» / «2.xlsx» или первое число в имени
  const num = stem.match(/(\d+)/)
  return num ? num[1] : null
}

/** Конвертирует рубли (float) в копейки (int). */
function rub2kop(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (typeof v === 'number') {
    // Excel serial date: days since 1900-01-01 (with the 1900 leap year bug)
    if (v > 30000 && v < 100000) {
      const d = new Date(Date.UTC(1899, 11, 30 + v))
      return isNaN(d.getTime()) ? null : d
    }
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof v === 'string') {
    // DD.MM.YYYY
    const ddmmyyyy = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (ddmmyyyy) {
      return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]))
    }
    // YYYY-MM-DD
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    }
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function toDateStr(v: unknown): string | null {
  const d = toDate(v)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Поля детального отчёта, колонки которых ищем по заголовку. */
type ColField =
  | 'period' | 'agent' | 'scheme' | 'clientName' | 'clientInn' | 'segment'
  | 'phoneActivation' | 'phoneCurrent' | 'subscriberId'
  | 'activationDate' | 'registrationDate'
  | 'tariffActivation' | 'tariffCurrent' | 'pointOfSale'
  | 'chargesTotal' | 'chargesPrev' | 'chargesMonth'
  | 'rewardPrev' | 'rewardRate' | 'rewardMonth'

type ColMap = Partial<Record<ColField, number>>

/** Денежные поля, к которым применяется коэффициент НДС при нормализации. */
const MONEY_FIELDS: ColField[] = ['chargesTotal', 'chargesPrev', 'chargesMonth', 'rewardPrev', 'rewardMonth']

/** Нормализует заголовок: нижний регистр, ё→е, схлопывание пробелов. */
function normHeader(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

/**
 * Строит карту «поле → индекс колонки» по строке заголовка детального листа.
 * Поиск по ключевым словам делает парсер устойчивым к сдвигу/добавлению
 * колонок (формат ≤2025 и формат 2026+ отличаются на 3 колонки).
 */
function buildColumnMap(header: unknown[]): ColMap {
  const h = header.map(normHeader)
  const find = (...needles: string[]): number | undefined => {
    const idx = h.findIndex(cell => cell && needles.every(n => cell.includes(n)))
    return idx === -1 ? undefined : idx
  }

  return {
    period:           find('отчетный период'),
    agent:            find('контрагент'),
    scheme:           find('имя схемы'),
    clientName:       find('наименование клиента'),
    clientInn:        find('инн клиента'),
    segment:          find('сегмент абонента'),
    phoneActivation:  find('номер на момент активации'),
    phoneCurrent:     find('номер на последний день'),
    subscriberId:     find('ид абонента'),               // нет в формате ≤2025
    activationDate:   find('дата активации'),
    registrationDate: find('дата регистрации'),
    tariffActivation: find('тарифный план на конец дня активации'),
    tariffCurrent:    find('тарифный план на конец отчетного месяца'),
    pointOfSale:      find('точка продаж'),
    chargesTotal:     find('начислений', 'накопительно'),
    chargesPrev:      find('начислений', 'за предыдущие периоды'),
    chargesMonth:     find('начислений', 'в отчетном месяце'),
    rewardPrev:       find('вознаграждения', 'за предыдущие периоды'),
    rewardRate:       find('ставка %'),
    rewardMonth:      find('вознаграждения', 'в отчетном месяце'),
  }
}

/**
 * Парсит xlsx-файл МегаФон — лист «Детальный отчет по абонентам».
 *
 * Колонки ищутся по тексту заголовка (а не по фиксированным номерам), т.к.
 * формат отчёта менялся: в 2026 МегаФон добавил 3 колонки («Наименования
 * правил», «ИД абонента», «Статус инфокарты»), сдвинув все денежные колонки.
 *
 * Нормализация НДС: до 2026 суммы приходили с НДС 20%, с 2026 — без НДС.
 * Чтобы динамика и KPI были сопоставимы, всё приводится к базе «без НДС»:
 * если заголовок денежной колонки содержит «с НДС», суммы делятся на 1.2.
 */
export function parseXlsx(buffer: Buffer, filename: string): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  // Ищем лист «Детальный отчет по абонентам»
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('детальный'))
  if (!sheetName) {
    throw new Error(`Лист «Детальный отчет по абонентам» не найден. Листы: ${wb.SheetNames.join(', ')}`)
  }

  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

  // Находим строку заголовка (содержит «Отчётный период»), данные идут после неё
  const headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => normHeader(c).includes('отчетный период')))
  if (headerIdx === -1) {
    throw new Error('Не найдена строка заголовка («Отчётный период») в детальном листе')
  }
  const col = buildColumnMap(rows[headerIdx])
  if (col.period === undefined || col.agent === undefined || col.chargesMonth === undefined || col.rewardMonth === undefined) {
    throw new Error(`Не удалось распознать ключевые колонки отчёта (period/agent/charges/reward). Найдено: ${JSON.stringify(col)}`)
  }

  // Коэффициент НДС: если суммы «с НДС» — приводим к «без НДС» делением на 1.2
  const chargesHeader = normHeader(rows[headerIdx][col.chargesMonth])
  const hasVat = chargesHeader.includes('с ндс') && !chargesHeader.includes('без ндс')
  const vatFactor = hasVat ? 1 / 1.2 : 1

  const parsed: ParsedRow[] = []
  let votes1 = 0 // голоса за договор «1» по «Имя схемы»
  let votes2 = 0 // голоса за договор «2»

  // Читает текстовую ячейку по полю; undefined-колонка → null
  const str = (r: unknown[], f: ColField): string | null => {
    const i = col[f]
    if (i === undefined) return null
    return r[i] ? String(r[i]).trim() : null
  }
  // Читает денежную ячейку (в копейках, после нормализации НДС)
  const money = (r: unknown[], f: ColField): number | null => {
    const i = col[f]
    if (i === undefined) return null
    const n = Number(r[i])
    if (!Number.isFinite(n)) return null
    return rub2kop(n * vatFactor)
  }

  logger.info(`[megafon] ${sheetName}: headerRow=${headerIdx}, vat=${hasVat ? 'с НДС→/1.2' : 'без НДС'}, chargesMonthCol=${col.chargesMonth}`)

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !Array.isArray(r)) continue

    const period = Number(r[col.period])
    if (!period || period < 200000) continue // не строка данных

    const agent = String(r[col.agent] ?? '').trim()
    if (!agent) continue

    // Голос за договор по «Имя схемы»: Унификация/B2B → д.1, прочее → д.2
    const scheme = col.scheme !== undefined ? String(r[col.scheme] ?? '').trim() : ''
    if (scheme) (schemeVotesContract1(scheme) ? votes1++ : votes2++)

    parsed.push({
      period,
      agent,
      contractId:       null, // проставим ниже, определив договор по данным
      clientName:       str(r, 'clientName'),
      clientInn:        str(r, 'clientInn'),
      segment:          str(r, 'segment'),
      phoneActivation:  str(r, 'phoneActivation'),
      phoneCurrent:     str(r, 'phoneCurrent'),
      subscriberId:     str(r, 'subscriberId'),
      activationDate:   col.activationDate   !== undefined ? toDate(r[col.activationDate])      : null,
      registrationDate: col.registrationDate !== undefined ? toDateStr(r[col.registrationDate]) : null,
      tariffActivation: str(r, 'tariffActivation'),
      tariffCurrent:    str(r, 'tariffCurrent'),
      pointOfSale:      str(r, 'pointOfSale'),
      chargesTotal:     money(r, 'chargesTotal'),
      chargesPrev:      money(r, 'chargesPrev'),
      chargesMonth:     money(r, 'chargesMonth'),
      rewardPrev:       money(r, 'rewardPrev'),
      rewardRate:       col.rewardRate !== undefined ? (Number(r[col.rewardRate]) || null) : null,
      rewardMonth:      money(r, 'rewardMonth'),
    })
  }

  // Договор определяем по данным («Имя схемы»); имя файла — запасной вариант
  const dataContract = votes1 > votes2 ? '1' : votes2 > 0 ? '2' : null
  const fileContract = extractContractId(filename)
  const contractId = dataContract ?? fileContract
  for (const r of parsed) r.contractId = contractId
  logger.info(`[megafon] contract=${contractId} (схемы: д1=${votes1}, д2=${votes2}; по имени=${fileContract ?? '—'})`)

  return parsed
}

// ===================== SUMMARY FROM FIRST SHEET =====================

interface SummaryInfo {
  totalRewardWithVat:    number | null
  totalRewardWithoutVat: number | null
}

export function parseSummary(buffer: Buffer): SummaryInfo {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('суммарный'))
  if (!sheetName) return { totalRewardWithVat: null, totalRewardWithoutVat: null }

  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  return {
    totalRewardWithVat:    rub2kop(rows[0]?.[3]),
    totalRewardWithoutVat: rub2kop(rows[1]?.[3]),
  }
}

// ===================== SERVICE =====================

export const megafonService = {
  /** Загружает xlsx-файл: парсит и сохраняет строки в БД. */
  async upload(buffer: Buffer, filename: string) {
    const startedAt = Date.now()
    const rows = parseXlsx(buffer, filename)

    if (rows.length === 0) {
      return { inserted: 0, period: null, error: 'Не найдено строк данных' }
    }

    const period = rows[0].period
    const contractId = rows[0].contractId

    // Удаляем старые данные за этот период + контракт (перезагрузка)
    if (contractId) {
      await db.delete(megafonReportRows).where(
        and(eq(megafonReportRows.period, period), eq(megafonReportRows.contractId, contractId))
      )
    } else {
      await db.delete(megafonReportRows).where(eq(megafonReportRows.period, period))
    }

    // Batch insert по 500 строк
    let inserted = 0
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      await db.insert(megafonReportRows).values(
        chunk.map(r => ({
          period:           r.period,
          agent:            r.agent,
          contractId:       r.contractId,
          clientName:       r.clientName,
          clientInn:        r.clientInn,
          segment:          r.segment,
          phoneActivation:  r.phoneActivation,
          phoneCurrent:     r.phoneCurrent,
          subscriberId:     r.subscriberId,
          activationDate:   r.activationDate,
          registrationDate: r.registrationDate,
          tariffActivation: r.tariffActivation,
          tariffCurrent:    r.tariffCurrent,
          pointOfSale:      r.pointOfSale,
          chargesTotal:     r.chargesTotal,
          chargesPrev:      r.chargesPrev,
          chargesMonth:     r.chargesMonth,
          rewardPrev:       r.rewardPrev,
          rewardRate:       r.rewardRate,
          rewardMonth:      r.rewardMonth,
        }))
      )
      inserted += chunk.length
    }

    // Удаляем старую запись о файле (тот же период + контракт)
    if (contractId) {
      await db.delete(megafonUploads).where(
        and(eq(megafonUploads.period, period), eq(megafonUploads.contractId, contractId))
      )
    }

    // Сохраняем запись о загруженном файле
    await db.insert(megafonUploads).values({
      filename,
      period,
      contractId,
      rowCount: inserted,
    })

    const summary = parseSummary(buffer)
    const elapsed = Date.now() - startedAt
    logger.info(`[megafon] uploaded ${filename}: ${inserted} rows, period=${period}, ${elapsed}ms`)

    return {
      inserted,
      period,
      contractId,
      totalRewardWithVat: summary.totalRewardWithVat,
      elapsed,
    }
  },

  /** Список загруженных файлов. */
  async getUploads() {
    return db
      .select()
      .from(megafonUploads)
      .orderBy(desc(megafonUploads.uploadedAt))
  },

  /** Удаляет загруженный файл и связанные данные. */
  async deleteUpload(uploadId: number) {
    const [upload] = await db.select().from(megafonUploads).where(eq(megafonUploads.id, uploadId))
    if (!upload) return { deleted: false, error: 'Файл не найден' }

    // Удаляем строки данных
    if (upload.contractId) {
      await db.delete(megafonReportRows).where(
        and(eq(megafonReportRows.period, upload.period), eq(megafonReportRows.contractId, upload.contractId))
      )
    } else {
      await db.delete(megafonReportRows).where(eq(megafonReportRows.period, upload.period))
    }

    // Удаляем запись о файле
    await db.delete(megafonUploads).where(eq(megafonUploads.id, uploadId))

    logger.info(`[megafon] deleted upload #${uploadId}: ${upload.filename}, period=${upload.period}`)
    return { deleted: true, filename: upload.filename, period: upload.period }
  },

  /** Список загруженных периодов. */
  async getPeriods() {
    const rows = await db
      .select({
        period: megafonReportRows.period,
        count: sql<number>`count(*)::int`,
        contracts: sql<string>`string_agg(distinct ${megafonReportRows.contractId}, ', ')`,
      })
      .from(megafonReportRows)
      .groupBy(megafonReportRows.period)
      .orderBy(megafonReportRows.period)

    return rows
  },

  /** Агрегированный отчёт по загруженным данным. */
  async getReport(period?: number) {
    const where = period ? eq(megafonReportRows.period, period) : undefined

    // Подсчёт подключений за период: registration_date попадает в месяц period
    const activatedExpr = sql<number>`count(*) FILTER (WHERE
      extract(year from ${megafonReportRows.registrationDate})::int * 100
      + extract(month from ${megafonReportRows.registrationDate})::int
      = ${megafonReportRows.period})::int`

    // Если «Все периоды» — абонентов считаем только из последнего периода,
    // т.к. одни и те же номера повторяются каждый месяц.
    // Начисления, вознаграждения, подключения — суммируем за все периоды.
    let latestPeriod: number | null = null
    if (!period) {
      const [row] = await db
        .select({ period: sql<number>`max(${megafonReportRows.period})` })
        .from(megafonReportRows)
      latestPeriod = row?.period ?? null
    }

    // Выражение для абонентов: при «Все периоды» считаем только из последнего
    const subscribersExpr = latestPeriod
      ? sql<number>`count(*) FILTER (WHERE ${megafonReportRows.period} = ${latestPeriod})::int`
      : sql<number>`count(*)::int`

    // По сегментам
    const bySegment = await db
      .select({
        segment: megafonReportRows.segment,
        subscribers: subscribersExpr,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::float8`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::float8`,
      })
      .from(megafonReportRows)
      .where(where)
      .groupBy(megafonReportRows.segment)
      .orderBy(sql`sum(${megafonReportRows.rewardMonth}) desc nulls last`)

    // По контрагентам (агентам)
    const byAgent = await db
      .select({
        agent: megafonReportRows.agent,
        subscribers: subscribersExpr,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::float8`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::float8`,
        rewardRates: sql<string>`string_agg(distinct ${megafonReportRows.rewardRate}::text, ', ' order by ${megafonReportRows.rewardRate}::text)`,
      })
      .from(megafonReportRows)
      .where(where)
      .groupBy(megafonReportRows.agent)
      .orderBy(sql`sum(${megafonReportRows.rewardMonth}) desc nulls last`)

    // По периодам (помесячная динамика)
    const byPeriod = await db
      .select({
        period: megafonReportRows.period,
        subscribers: sql<number>`count(*)::int`,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::float8`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::float8`,
      })
      .from(megafonReportRows)
      .groupBy(megafonReportRows.period)
      .orderBy(megafonReportRows.period)

    // Итого
    const totals = await db
      .select({
        subscribers: subscribersExpr,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::float8`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::float8`,
      })
      .from(megafonReportRows)
      .where(where)

    return {
      totals: totals[0] ?? { subscribers: 0, activated: 0, chargesMonth: 0, rewardMonth: 0 },
      bySegment,
      byAgent,
      byPeriod,
    }
  },

  /**
   * Динамика вознаграждений по месяцам с разбивкой по двум договорам.
   *
   * Каждый месяц загружаются 2 файла — по одному на договор:
   *   - contractId «1» → «1-01072015/АСМ»      (старый договор)
   *   - contractId «2» → «1-01.05.2018/АС/B2B» (новый договор B2B)
   *
   * Возвращаем для каждого договора пару { key, label }:
   *   - key   — безопасный идентификатор без точек/слэшей (= contractId),
   *             используется фронтом как dataKey графика;
   *   - label — человекочитаемое название договора.
   * Список contracts строится из реально присутствующих в данных ключей,
   * поэтому сумма линий всегда совпадает с «Итого».
   */
  async getDynamics() {
    // Название договора по contractId
    const LABELS: Record<string, string> = {
      '1': '1-01072015/АСМ',
      '2': '1-01.05.2018/АС/B2B',
    }
    const labelFor = (cid: string) => LABELS[cid] ?? `Договор ${cid}`

    // 1. Сырые данные по периоду + contractId
    const rawRows = await db
      .select({
        period: megafonReportRows.period,
        contractId: megafonReportRows.contractId,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::float8`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::float8`,
      })
      .from(megafonReportRows)
      .groupBy(megafonReportRows.period, megafonReportRows.contractId)
      .orderBy(megafonReportRows.period)

    // 2. Агрегируем по периоду + ключу договора
    const grouped = new Map<string, { period: number; key: string; chargesMonth: number; rewardMonth: number }>()
    const keysInData = new Set<string>()
    for (const r of rawRows) {
      const key = r.contractId ?? 'unknown'
      keysInData.add(key)
      const mapKey = `${r.period}_${key}`
      const existing = grouped.get(mapKey)
      if (existing) {
        existing.chargesMonth += r.chargesMonth
        existing.rewardMonth += r.rewardMonth
      } else {
        grouped.set(mapKey, { period: r.period, key, chargesMonth: r.chargesMonth, rewardMonth: r.rewardMonth })
      }
    }

    const rows = Array.from(grouped.values()).sort((a, b) => a.period - b.period || a.key.localeCompare(b.key))

    // Список договоров — из реально присутствующих ключей, в стабильном порядке
    const contracts = Array.from(keysInData)
      .sort((a, b) => a.localeCompare(b))
      .map(key => ({ key, label: labelFor(key) }))

    return { rows, contracts }
  },

  /**
   * Когортный отчёт: какие компании подключились в каком месяце и какое
   * вознаграждение приносят помесячно.
   *
   * - Идентификатор компании: ИНН (если есть), иначе наименование клиента.
   * - Месяц подключения (cohort) = месяц самой ранней РЕГИСТРАЦИИ среди её
   *   строк. Если дат регистрации нет — откат на активацию, затем на первый
   *   период появления в выгрузках (cohortApprox=true, метка «не позже»).
   * - Все суммы — в копейках, БЕЗ НДС (так данные и хранятся: отчёты ≤2025
   *   парсер уже нормализовал делением на 1.2). См. [[megafon-report-parsing]].
   * - Текущий договор компании — по самому позднему её периоду.
   */
  async getCompanyCohorts() {
    const LABELS: Record<string, string> = {
      '1': '1-01072015/АСМ',
      '2': '1-01.05.2018/АС/B2B',
    }
    const labelFor = (cid: string | null) => (cid ? (LABELS[cid] ?? `Договор ${cid}`) : '—')

    // Ключ компании: ИНН (непустой) или наименование. NULLIF убирает пустые строки.
    const keyExpr = sql<string>`coalesce(nullif(${megafonReportRows.clientInn}, ''), ${megafonReportRows.clientName})`
    const notNullKey = sql`coalesce(nullif(${megafonReportRows.clientInn}, ''), ${megafonReportRows.clientName}) is not null`

    // 1. Матрица вознаграждений: компания × период (копейки, без НДС)
    const matrix = await db
      .select({
        key: keyExpr,
        period: megafonReportRows.period,
        reward: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::float8`,
      })
      .from(megafonReportRows)
      .where(notNullKey)
      .groupBy(keyExpr, megafonReportRows.period)

    // 2. Метаданные компании + когорта подключения
    const meta = await db
      .select({
        key: keyExpr,
        inn: sql<string | null>`max(${megafonReportRows.clientInn})`,
        name: sql<string | null>`max(${megafonReportRows.clientName})`,
        firstPeriod: sql<number>`min(${megafonReportRows.period})::int`,
        // месяц самой ранней РЕГИСТРАЦИИ (YYYYMM) или null — основной признак подключения
        cohortReg: sql<number | null>`case when min(${megafonReportRows.registrationDate}) is not null
          then extract(year from min(${megafonReportRows.registrationDate}))::int * 100
             + extract(month from min(${megafonReportRows.registrationDate}))::int
          else null end`,
        // месяц самой ранней активации — запасной вариант, если регистрации нет
        cohortAct: sql<number | null>`case when min(${megafonReportRows.activationDate}) is not null
          then extract(year from min(${megafonReportRows.activationDate}))::int * 100
             + extract(month from min(${megafonReportRows.activationDate}))::int
          else null end`,
        // текущий договор — по самому позднему периоду
        contractId: sql<string | null>`(array_agg(${megafonReportRows.contractId} order by ${megafonReportRows.period} desc))[1]`,
      })
      .from(megafonReportRows)
      .where(notNullKey)
      .groupBy(keyExpr)

    // 3. Сборка: для каждой компании — карта период→вознаграждение + когорта
    const rewardByKey = new Map<string, Record<number, number>>()
    const periodsSet = new Set<number>()
    for (const m of matrix) {
      periodsSet.add(m.period)
      let rec = rewardByKey.get(m.key)
      if (!rec) { rec = {}; rewardByKey.set(m.key, rec) }
      rec[m.period] = Math.round(m.reward)
    }

    const periods = Array.from(periodsSet).sort((a, b) => a - b)

    const companies = meta.map((m) => {
      const rewardByPeriod = rewardByKey.get(m.key) ?? {}
      const totalReward = Object.values(rewardByPeriod).reduce((s, v) => s + v, 0)
      // Месяц подключения: по дате регистрации; если её нет — по активации; иначе первый период
      const cohort = m.cohortReg ?? m.cohortAct ?? m.firstPeriod
      return {
        key: m.key,
        name: m.name,
        inn: m.inn,
        contractId: m.contractId,
        contractLabel: labelFor(m.contractId),
        cohort,
        cohortApprox: m.cohortReg == null, // нет даты регистрации → когорта приблизительна
        totalReward,
        rewardByPeriod,
      }
    })

    // Сортировка по умолчанию: сначала новые когорты, внутри — по вкладу
    companies.sort((a, b) => b.cohort - a.cohort || b.totalReward - a.totalReward)

    return { periods, companies }
  },
}
