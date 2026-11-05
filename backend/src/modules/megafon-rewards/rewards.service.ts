import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmUsers, megafonReportRows } from '../../db/schema.js'
import {
  amocrm,
  type AmoCustomFieldDef,
  type AmoCustomFieldValue,
  type AmoLead,
} from '../amocrm/client.js'
import { logger } from '../../core/logger.js'
import { config } from '../../core/config.js'

const amoUrl = () => `https://${config.AMOCRM_SUBDOMAIN}.amocrm.ru`

/**
 * Вознаграждение сотрудникам за подключённых клиентов (воронка
 * «МегаФон Корп клиенты» в amoCRM).
 *
 * Правило: сотруднику платим начисления клиента за его ПЕРВЫЙ ПОЛНЫЙ месяц.
 * Подключили 15 августа → август неполный → считаем по сентябрю.
 *
 * - Месяц подключения = месяц самой ранней даты регистрации клиента в
 *   отчётах МегаФон (по ИНН). Если клиента в отчётах нет — по дате закрытия
 *   сделки в amoCRM.
 * - Сумма = начисления клиента (charges_month) за полный месяц, без НДС,
 *   как хранится в megafon_report_rows.
 * - Пишем в сделку: «Отчетный период» + «Вознаграждение за отчетный период».
 *   Отметка «Вознаграждение выплачено» ставится отдельной кнопкой.
 *
 * Воронку и поля находим по названиям — id не зашиты, чтобы переименование
 * enum-значений периода в amoCRM не ломало интеграцию.
 */

const WON_STATUS = 142
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_TITLE = MONTHS.map(m => m[0].toUpperCase() + m.slice(1))

// ───────────────────────── периоды YYYYMM ─────────────────────────

const addMonths = (p: number, n: number) => {
  const idx = Math.floor(p / 100) * 12 + (p % 100 - 1) + n
  return Math.floor(idx / 12) * 100 + (idx % 12) + 1
}
export const periodTitle = (p: number) => `${MONTHS_TITLE[p % 100 - 1]} ${Math.floor(p / 100)}`

/** Месяц (YYYYMM) unix-времени по Москве. */
function periodOfUnix(sec: number): number {
  const d = new Date((sec + 3 * 3600) * 1000)
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1
}

/**
 * Разбор подписи периода из amoCRM: «Сентябрь 2026», «сентябрь 26»,
 * «09.2026», «2026-09», «Сентябрь» (без года → year=null).
 */
function parsePeriodLabel(raw: string): { month: number; year: number | null } | null {
  const s = raw.toLowerCase().replace(/ё/g, 'е').trim()
  let m = s.match(/^(\d{4})[-./](\d{1,2})$/)
  if (m) return { year: +m[1], month: +m[2] }
  m = s.match(/^(\d{1,2})[-./](\d{2}|\d{4})$/)
  if (m) return { month: +m[1], year: m[2].length === 2 ? 2000 + +m[2] : +m[2] }
  const idx = MONTHS.findIndex(name => s.startsWith(name.slice(0, 3)))
  if (idx < 0) return null
  const y = s.match(/(\d{4}|\d{2})\s*(г\.?|год)?$/)
  const year = y ? (y[1].length === 2 ? 2000 + +y[1] : +y[1]) : null
  return { month: idx + 1, year }
}

// ───────────────────────── конфигурация amoCRM ─────────────────────────

interface Setup {
  pipelineId:   number
  pipelineName: string
  periodField:  AmoCustomFieldDef
  rewardField:  AmoCustomFieldDef
  paidField:    AmoCustomFieldDef | null
  leadInnField: AmoCustomFieldDef | null
  compInnField: AmoCustomFieldDef | null
}

let setupCache: { at: number; value: Setup } | null = null

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

async function getSetup(): Promise<Setup> {
  if (setupCache && Date.now() - setupCache.at < 10 * 60_000) return setupCache.value

  const pipelines = await amocrm.pipelines()
  const pipeline = pipelines.find(p => /корп/.test(norm(p.name)) && /мегафон/.test(norm(p.name)))
    ?? pipelines.find(p => /корп/.test(norm(p.name)))
  if (!pipeline) {
    throw new Error(`Не нашёл воронку «МегаФон Корп клиенты». Есть: ${pipelines.map(p => p.name).join(', ')}`)
  }

  const leadFields = await amocrm.customFields('leads')
  const find = (re: RegExp) => leadFields.find(f => re.test(norm(f.name))) ?? null
  const periodField = find(/^отчетн\S* период/)
  const rewardField = find(/^вознагражд\S* за отчет/)
  const paidField   = find(/^вознагражд\S* выплач/)
  if (!periodField || !rewardField) {
    throw new Error(
      'Не нашёл в сделках поля «Отчетный период» / «Вознаграждение за отчетный период». ' +
      `Поля сделок: ${leadFields.map(f => f.name).join(', ')}`,
    )
  }
  const leadInnField = find(/(^|\s)инн(\s|$)/)
  const compFields = await amocrm.customFields('companies')
  const compInnField = compFields.find(f => /(^|\s)инн(\s|$)/.test(norm(f.name))) ?? null

  const value: Setup = {
    pipelineId: pipeline.id, pipelineName: pipeline.name,
    periodField, rewardField, paidField, leadInnField, compInnField,
  }
  logger.info('rewards setup', {
    pipeline: pipeline.id, period: periodField.id, periodType: periodField.type,
    reward: rewardField.id, paid: paidField?.id, leadInn: leadInnField?.id, compInn: compInnField?.id,
  })
  setupCache = { at: Date.now(), value }
  return value
}

// ───────────────────────── чтение/запись значений полей ─────────────────────────

const fieldValue = (cfv: AmoCustomFieldValue[] | null | undefined, fieldId: number): unknown =>
  cfv?.find(v => v.field_id === fieldId)?.values?.[0]?.value ?? null

/** Текущее значение «Отчетного периода» в сделке → YYYYMM (или null). */
function readPeriod(lead: AmoLead, f: AmoCustomFieldDef, fallbackYear: number): number | null {
  const v = fieldValue(lead.custom_fields_values, f.id)
  if (v == null || v === '') return null
  if (f.type === 'date' || f.type === 'date_time' || typeof v === 'number') {
    const sec = typeof v === 'number' ? v : Math.floor(Date.parse(String(v)) / 1000)
    return Number.isFinite(sec) ? periodOfUnix(sec) : null
  }
  const parsed = parsePeriodLabel(String(v))
  if (!parsed) return null
  return (parsed.year ?? fallbackYear) * 100 + parsed.month
}

/** Значение для записи периода в поле нужного типа. */
function periodPayload(f: AmoCustomFieldDef, period: number): { values: unknown[] } {
  if (f.type === 'select' || f.type === 'multiselect' || f.type === 'radiobutton') {
    const year = Math.floor(period / 100), month = period % 100
    const candidates = (f.enums ?? []).map(e => ({ e, p: parsePeriodLabel(e.value) }))
      .filter(x => x.p && x.p.month === month)
    const hit = candidates.find(x => x.p!.year === year) ?? candidates.find(x => x.p!.year == null)
    if (!hit) {
      throw new Error(
        `В поле «${f.name}» нет значения для «${periodTitle(period)}». ` +
        `Добавьте его в настройках поля amoCRM. Сейчас есть: ${(f.enums ?? []).map(e => e.value).join(', ')}`,
      )
    }
    return { values: [{ enum_id: hit.e.id }] }
  }
  if (f.type === 'date' || f.type === 'date_time') {
    const y = Math.floor(period / 100), m = period % 100
    return { values: [{ value: Math.floor(Date.UTC(y, m - 1, 1, 0, 0, 0) / 1000) - 3 * 3600 }] }
  }
  return { values: [{ value: periodTitle(period) }] }
}

function moneyPayload(f: AmoCustomFieldDef, kop: number): { values: unknown[] } {
  const rub = Math.round(kop) / 100
  if (f.type === 'numeric' || f.type === 'price' || f.type === 'monetary') return { values: [{ value: rub }] }
  return { values: [{ value: String(rub) }] }
}

function readMoneyKop(lead: AmoLead, f: AmoCustomFieldDef): number | null {
  const v = fieldValue(lead.custom_fields_values, f.id)
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const readPaid = (lead: AmoLead, f: AmoCustomFieldDef | null) => {
  if (!f) return false
  const v = fieldValue(lead.custom_fields_values, f.id)
  return v === true || v === 'true' || v === 1 || v === '1'
}

const onlyDigits = (v: unknown) => (v == null ? '' : String(v).replace(/\D/g, ''))

// ───────────────────────── сделки + ИНН ─────────────────────────

interface WonDeal {
  lead:     AmoLead
  inn:      string | null
  company:  string | null
}

async function loadWonDeals(setup: Setup): Promise<WonDeal[]> {
  const leads: AmoLead[] = []
  for await (const l of amocrm.leadsByStatus(setup.pipelineId, WON_STATUS)) leads.push(l)

  // ИНН: поле сделки → поле компании
  const companyIds = new Set<number>()
  for (const l of leads) {
    const cid = l._embedded?.companies?.[0]?.id
    if (cid) companyIds.add(cid)
  }
  const companies = companyIds.size ? await amocrm.companiesByIds([...companyIds]) : []
  const compById = new Map(companies.map(c => [c.id, c]))

  return leads.map(lead => {
    const comp = compById.get(lead._embedded?.companies?.[0]?.id ?? -1) ?? null
    let inn = setup.leadInnField ? onlyDigits(fieldValue(lead.custom_fields_values, setup.leadInnField.id)) : ''
    if (!inn && comp && setup.compInnField) inn = onlyDigits(fieldValue(comp.custom_fields_values, setup.compInnField.id))
    return { lead, inn: inn.length === 10 || inn.length === 12 ? inn : null, company: comp?.name ?? null }
  })
}

const userNames = async () => {
  const rows = await db.select({ id: amocrmUsers.id, name: amocrmUsers.name }).from(amocrmUsers)
  return new Map(rows.map(r => [r.id, r.name]))
}

// ───────────────────────── превью начисления ─────────────────────────

export type AccrualStatus =
  | 'ready'      // полный месяц = выбранный, начисляем
  | 'accrued'    // уже начислено за этот же период (можно пересчитать)
  | 'other'      // уже начислено за другой период
  | 'early'      // полный месяц ещё не наступил
  | 'overdue'    // полный месяц был раньше, но не начислено
  | 'no_inn'     // в сделке/компании нет ИНН
  | 'not_found'  // ИНН есть, но в отчётах МегаФон клиента нет

export interface AccrualRow {
  dealId:         number
  dealName:       string | null
  company:        string | null
  inn:            string | null
  managerId:      number
  manager:        string
  connectedOn:    string | null   // YYYY-MM-DD — дата регистрации (МегаФон) или закрытия сделки
  connectedFrom:  'megafon' | 'deal'
  fullMonth:      number | null   // YYYYMM первого полного месяца
  charges:        number          // копейки, без НДС, за выбранный период
  inReport:       boolean         // есть ли клиент в отчёте выбранного периода
  status:         AccrualStatus
  selectable:     boolean
  currentPeriod:  number | null
  currentAmount:  number | null   // копейки
  paid:           boolean
}

async function buildAccrual(period: number) {
  const setup = await getSetup()
  const deals = await loadWonDeals(setup)
  const inns = [...new Set(deals.map(d => d.inn).filter((x): x is string => !!x))]

  // Данные МегаФон по ИНН: самая ранняя регистрация + начисления за период
  const meta = new Map<string, { firstReg: string | null; firstPeriod: number }>()
  const charges = new Map<string, number>()
  if (inns.length) {
    const innList = sql.join(inns.map(i => sql`${i}`), sql`, `)
    const m = await db
      .select({
        inn: megafonReportRows.clientInn,
        firstReg: sql<string | null>`min(${megafonReportRows.registrationDate})::text`,
        firstPeriod: sql<number>`min(${megafonReportRows.period})::int`,
      })
      .from(megafonReportRows)
      .where(sql`${megafonReportRows.clientInn} in (${innList})`)
      .groupBy(megafonReportRows.clientInn)
    for (const r of m) if (r.inn) meta.set(r.inn, { firstReg: r.firstReg, firstPeriod: r.firstPeriod })

    const c = await db
      .select({
        inn: megafonReportRows.clientInn,
        sum: sql<number>`coalesce(sum(${megafonReportRows.chargesMonth}), 0)::float8`,
      })
      .from(megafonReportRows)
      .where(sql`${megafonReportRows.clientInn} in (${innList}) and ${megafonReportRows.period} = ${period}`)
      .groupBy(megafonReportRows.clientInn)
    for (const r of c) if (r.inn) charges.set(r.inn, Math.round(r.sum))
  }

  const names = await userNames()
  const fallbackYear = Math.floor(period / 100)

  const rows: AccrualRow[] = deals.map(({ lead, inn, company }) => {
    const mf = inn ? meta.get(inn) : undefined
    let connectedOn: string | null = null
    let connectedFrom: AccrualRow['connectedFrom'] = 'deal'
    let connPeriod: number | null = null
    if (mf?.firstReg) {
      connectedOn = mf.firstReg
      connectedFrom = 'megafon'
      connPeriod = +mf.firstReg.slice(0, 4) * 100 + +mf.firstReg.slice(5, 7)
    } else if (lead.closed_at) {
      connectedOn = new Date((lead.closed_at + 3 * 3600) * 1000).toISOString().slice(0, 10)
      connPeriod = periodOfUnix(lead.closed_at)
    }
    // Подключение 1-го числа — месяц уже полный
    const fullMonth = connPeriod == null ? null
      : connectedOn?.endsWith('-01') ? connPeriod : addMonths(connPeriod, 1)

    const currentPeriod = readPeriod(lead, setup.periodField, fallbackYear)
    const currentAmount = readMoneyKop(lead, setup.rewardField)
    const ch = inn ? charges.get(inn) ?? 0 : 0

    let status: AccrualStatus
    if (currentPeriod === period) status = 'accrued'
    else if (currentPeriod != null) status = 'other'
    else if (!inn) status = 'no_inn'
    else if (!mf) status = 'not_found'
    else if (fullMonth == null || fullMonth > period) status = 'early'
    else if (fullMonth < period) status = 'overdue'
    else status = 'ready'

    return {
      dealId: lead.id,
      dealName: lead.name,
      company,
      inn,
      managerId: lead.responsible_user_id,
      manager: names.get(lead.responsible_user_id) ?? `#${lead.responsible_user_id}`,
      connectedOn,
      connectedFrom,
      fullMonth,
      charges: ch,
      inReport: inn ? charges.has(inn) : false,
      status,
      selectable: status === 'ready' || status === 'accrued',
      currentPeriod,
      currentAmount,
      paid: readPaid(lead, setup.paidField),
    }
  })

  return { setup, rows }
}

// ───────────────────────── публичное API ─────────────────────────

export const rewardsService = {
  async preview(period: number) {
    const { setup, rows } = await buildAccrual(period)
    const loaded = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(megafonReportRows)
      .where(sql`${megafonReportRows.period} = ${period}`)
    return {
      period,
      amoUrl: amoUrl(),
      pipelineId: setup.pipelineId,
      pipelineName: setup.pipelineName,
      reportLoaded: (loaded[0]?.c ?? 0) > 0,
      rows,
    }
  },

  /** Записывает период и сумму в выбранные сделки. Сумму пересчитываем на сервере. */
  async accrue(period: number, dealIds: number[]) {
    const { setup, rows } = await buildAccrual(period)
    const wanted = new Set(dealIds)
    const target = rows.filter(r => wanted.has(r.dealId) && r.selectable)
    if (!target.length) return { updated: 0, total: 0 }

    const periodVal = periodPayload(setup.periodField, period)
    const updates = target.map(r => ({
      id: r.dealId,
      custom_fields_values: [
        { field_id: setup.periodField.id, ...periodVal },
        { field_id: setup.rewardField.id, ...moneyPayload(setup.rewardField, r.charges) },
        ...(setup.paidField ? [{ field_id: setup.paidField.id, values: [{ value: false }] }] : []),
      ],
    }))
    await amocrm.patchLeads(updates)
    const total = target.reduce((s, r) => s + r.charges, 0)
    logger.info('rewards accrued', { period, deals: target.length, total })
    return { updated: target.length, total }
  },

  /** Сделки с начисленным вознаграждением (для отметки «выплачено»). */
  async payouts(period: number | null) {
    const setup = await getSetup()
    if (!setup.paidField) throw new Error('Не нашёл в сделках поле «Вознаграждение выплачено»')
    const deals = await loadWonDeals(setup)
    const names = await userNames()
    const year = period ? Math.floor(period / 100) : new Date().getFullYear()

    const all = deals
      .map(({ lead, inn, company }) => ({
        dealId: lead.id,
        dealName: lead.name,
        company,
        inn,
        managerId: lead.responsible_user_id,
        manager: names.get(lead.responsible_user_id) ?? `#${lead.responsible_user_id}`,
        period: readPeriod(lead, setup.periodField, year),
        amount: readMoneyKop(lead, setup.rewardField) ?? 0,
        paid: readPaid(lead, setup.paidField),
      }))
      .filter(r => r.period != null)

    const periods = [...new Set(all.map(r => r.period!))].sort((a, b) => b - a)
    const unpaidPeriods = [...new Set(all.filter(r => !r.paid).map(r => r.period!))]
    return {
      amoUrl: amoUrl(),
      periods: periods.map(p => ({ period: p, hasUnpaid: unpaidPeriods.includes(p) })),
      rows: period ? all.filter(r => r.period === period) : all,
    }
  },

  async setPaid(dealIds: number[], paid: boolean) {
    const setup = await getSetup()
    if (!setup.paidField) throw new Error('Не нашёл в сделках поле «Вознаграждение выплачено»')
    await amocrm.patchLeads(dealIds.map(id => ({
      id,
      custom_fields_values: [{ field_id: setup.paidField!.id, values: [{ value: paid }] }],
    })))
    logger.info('rewards paid flag', { deals: dealIds.length, paid })
    return { updated: dealIds.length }
  },
}
