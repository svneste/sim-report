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

/** Извлекает contract ID из имени файла (pscs_id_XXXXXXX). */
function extractContractId(filename: string): string | null {
  const m = filename.match(/pscs_id_(\d+)/)
  return m ? m[1] : null
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

/**
 * Парсит xlsx-файл МегаФон — лист «Детальный отчет по абонентам».
 * Колонки (0-based, с учётом что col 0 = None):
 *   1:  Отчётный период
 *   2:  Контрагент
 *   5:  Лицевой счет
 *   6:  ИНН клиента
 *   8:  Наименование клиента
 *   9:  Сегмент абонента
 *  11:  Номер на момент активации
 *  12:  Номер на последний день отчетного месяца
 *  13:  ИД абонента
 *  14:  Дата активации
 *  15:  Дата регистрации
 *  17:  Точка продаж
 *  18:  ТП на конец дня активации
 *  19:  ТП на конец отчетного месяца
 *  20:  Начисления накопительно без НДС
 *  21:  Начисления за предыдущие периоды без НДС
 *  22:  Начисления за отчётный месяц без НДС
 *  23:  Вознаграждение за предыдущие периоды без НДС
 *  24:  Ставка %
 *  25:  Вознаграждение за месяц без НДС
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

  const contractId = extractContractId(filename)
  const parsed: ParsedRow[] = []

  // Лог первой строки данных для отладки парсинга
  if (rows[2]) {
    const r = rows[2] as unknown[]
    logger.info(`[megafon] sample row[2]: period=${r[1]}, activationDate=${r[14]} (${typeof r[14]}), registrationDate=${r[15]} (${typeof r[15]})`)
  }

  // Пропускаем заголовки (строки 0-1), данные начинаются со строки 2
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !Array.isArray(r)) continue

    const period = Number(r[1])
    if (!period || period < 200000) continue // не строка данных

    const agent = String(r[2] ?? '').trim()
    if (!agent) continue

    parsed.push({
      period,
      agent,
      contractId,
      clientName:       r[8] ? String(r[8]).trim() : null,
      clientInn:        r[6] ? String(r[6]).trim() : null,
      segment:          r[9] ? String(r[9]).trim() : null,
      phoneActivation:  r[11] ? String(r[11]).trim() : null,
      phoneCurrent:     r[12] ? String(r[12]).trim() : null,
      subscriberId:     r[13] ? String(r[13]).trim() : null,
      activationDate:   toDate(r[14]),
      registrationDate: toDateStr(r[15]),
      tariffActivation: r[18] ? String(r[18]).trim() : null,
      tariffCurrent:    r[19] ? String(r[19]).trim() : null,
      pointOfSale:      r[17] ? String(r[17]).trim() : null,
      chargesTotal:     rub2kop(r[20]),
      chargesPrev:      rub2kop(r[21]),
      chargesMonth:     rub2kop(r[22]),
      rewardPrev:       rub2kop(r[23]),
      rewardRate:       Number(r[24]) || null,
      rewardMonth:      rub2kop(r[25]),
    })
  }

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

    // По сегментам
    const bySegment = await db
      .select({
        segment: megafonReportRows.segment,
        subscribers: sql<number>`count(*)::int`,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::int`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::int`,
      })
      .from(megafonReportRows)
      .where(where)
      .groupBy(megafonReportRows.segment)
      .orderBy(sql`sum(${megafonReportRows.rewardMonth}) desc nulls last`)

    // По контрагентам (агентам)
    const byAgent = await db
      .select({
        agent: megafonReportRows.agent,
        subscribers: sql<number>`count(*)::int`,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::int`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::int`,
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
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::int`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::int`,
      })
      .from(megafonReportRows)
      .groupBy(megafonReportRows.period)
      .orderBy(megafonReportRows.period)

    // Итого
    const totals = await db
      .select({
        subscribers: sql<number>`count(*)::int`,
        activated: activatedExpr,
        chargesMonth: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::int`,
        rewardMonth: sql<number>`coalesce(sum(${megafonReportRows.rewardMonth}), 0)::int`,
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
}
