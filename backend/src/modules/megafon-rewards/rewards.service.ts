import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmUsers, megafonReportRows } from '../../db/schema.js'
import {
  amocrm,
  type AmoCompany,
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
  leadInnFields: AmoCustomFieldDef[]
  compInnFields: AmoCustomFieldDef[]
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
  const isInn = (f: AmoCustomFieldDef) => /инн/.test(norm(f.name))
  const leadInnFields = leadFields.filter(isInn)
  const compFields = await amocrm.customFields('companies')
  const compInnFields = compFields.filter(isInn)

  const value: Setup = {
    pipelineId: pipeline.id, pipelineName: pipeline.name,
    periodField, rewardField, paidField, leadInnFields, compInnFields,
  }
  logger.info('rewards setup', {
    pipeline: pipeline.id, period: periodField.id, periodType: periodField.type,
    reward: rewardField.id, paid: paidField?.id, leadInn: leadInnFields.map(f => f.name), compInn: compInnFields.map(f => f.name),
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

interface RawDeal {
  lead: AmoLead
  comp: AmoCompany | null
}

export type InnSource = 'field' | 'scan' | 'name'

interface WonDeal {
  lead:      AmoLead
  inn:       string | null
  innSource: InnSource | null
  company:   string | null
}

async function loadWonDeals(_setup: Setup): Promise<RawDeal[]> {
  const leads: AmoLead[] = []
  for await (const l of amocrm.leadsByStatus(_setup.pipelineId, WON_STATUS)) leads.push(l)

  const companyIds = new Set<number>()
  for (const l of leads) {
    const cid = l._embedded?.companies?.[0]?.id
    if (cid) companyIds.add(cid)
  }
  const companies = companyIds.size ? await amocrm.companiesByIds([...companyIds]) : []
  const compById = new Map(companies.map(c => [c.id, c]))
  return leads.map(lead => ({ lead, comp: compById.get(lead._embedded?.companies?.[0]?.id ?? -1) ?? null }))
}

// Нормализация названия для сопоставления с отчётом МегаФон:
// без ОПФ, кавычек и пунктуации. «ООО "Завод «Алпас»"» → «завод алпас»
const LEGAL_FORMS = /\b(ооо|оао|зао|пао|ао|ип|нко|ано|ано дпо|гбу|гку|гуп|муп|фгуп|фгбу|тсж|снт|кфх|общество с ограниченной ответственностью|акционерное общество|индивидуальный предприниматель)\b/g
const normName = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`“”„]/g, ' ').replace(/[^a-zа-я0-9 ]/g, ' ')
    .replace(LEGAL_FORMS, ' ').replace(/\s+/g, ' ').trim()

interface MegafonIndex { inns: Set<string>; byName: Map<string, string | null> }

async function megafonIndex(): Promise<MegafonIndex> {
  const rows = await db
    .selectDistinct({ inn: megafonReportRows.clientInn, name: megafonReportRows.clientName })
    .from(megafonReportRows)
  const inns = new Set<string>()
  const byName = new Map<string, string | null>()
  for (const r of rows) {
    const inn = onlyDigits(r.inn)
    if (inn) inns.add(inn)
    const n = normName(r.name)
    if (n.length < 3 || !inn) continue
    // одно название у разных ИНН — неоднозначно, по названию не матчим
    if (byName.has(n) && byName.get(n) !== inn) byName.set(n, null); else byName.set(n, inn)
  }
  return { inns, byName }
}

const INN_RE = /(?<!\d)(\d{12}|\d{10})(?!\d)/g

/**
 * ИНН сделки, по убыванию надёжности:
 * 1) поле с «ИНН» в названии (сделка, затем компания);
 * 2) любое 10/12-значное число в полях сделки/компании, которое есть в отчётах МегаФон;
 * 3) название компании/сделки совпало с наименованием клиента в отчётах МегаФон.
 */
function resolveInn(setup: Setup, d: RawDeal, idx: MegafonIndex): { inn: string | null; source: InnSource | null } {
  const cfvs = [d.lead.custom_fields_values, d.comp?.custom_fields_values]
  const named = [
    ...setup.leadInnFields.map(f => onlyDigits(fieldValue(d.lead.custom_fields_values, f.id))),
    ...setup.compInnFields.map(f => onlyDigits(fieldValue(d.comp?.custom_fields_values, f.id))),
  ].filter(v => v.length === 10 || v.length === 12)
  const namedKnown = named.find(v => idx.inns.has(v))
  if (namedKnown) return { inn: namedKnown, source: 'field' }

  const texts = [d.lead.name, d.comp?.name]
  for (const cfv of cfvs) for (const f of cfv ?? []) for (const v of f.values ?? []) texts.push(String(v.value ?? ''))
  for (const t of texts) {
    for (const m of (t ?? '').matchAll(INN_RE)) if (idx.inns.has(m[1])) return { inn: m[1], source: 'scan' }
  }

  for (const n of [d.comp?.name, d.lead.name]) {
    const inn = idx.byName.get(normName(n))
    if (inn) return { inn, source: 'name' }
  }
  // ИНН из поля есть, но в отчётах его нет — вернём как есть (статус «нет в отчётах МФ»)
  return named[0] ? { inn: named[0], source: 'field' } : { inn: null, source: null }
}

async function resolveDeals(setup: Setup, raws: RawDeal[]): Promise<WonDeal[]> {
  const idx = await megafonIndex()
  return raws.map(d => {
    const { inn, source } = resolveInn(setup, d, idx)
    return { lead: d.lead, inn, innSource: source, company: d.comp?.name ?? null }
  })
}

/**
 * Кэш успешных сделок в памяти: выкачка из amoCRM (сделки + компании) —
 * самое долгое место. Держим 15 мин, параллельные запросы ждут одну выкачку,
 * после своих записей (начисление/выплата) правим кэш на месте.
 */
const DEALS_TTL = 15 * 60_000
let dealsCache: { at: number; value: RawDeal[] } | null = null
let dealsInflight: Promise<RawDeal[]> | null = null

async function getRawDeals(setup: Setup, force = false): Promise<RawDeal[]> {
  if (!force && dealsCache && Date.now() - dealsCache.at < DEALS_TTL) return dealsCache.value
  if (dealsInflight) return dealsInflight
  const started = Date.now()
  dealsInflight = loadWonDeals(setup)
    .then(value => {
      dealsCache = { at: Date.now(), value }
      logger.info('rewards deals loaded', { deals: value.length, ms: Date.now() - started })
      return value
    })
    .finally(() => { dealsInflight = null })
  return dealsInflight
}

async function getWonDeals(setup: Setup, force = false): Promise<WonDeal[]> {
  return resolveDeals(setup, await getRawDeals(setup, force))
}

/** Применить наш PATCH к закэшированным сделкам (enum_id → подпись для чтения). */
function applyToCache(setup: Setup, updates: Array<{ id: number; custom_fields_values: Array<{ field_id: number; values: unknown[] }> }>) {
  if (!dealsCache) return
  const byId = new Map(dealsCache.value.map(d => [d.lead.id, d.lead]))
  for (const u of updates) {
    const lead = byId.get(u.id)
    if (!lead) continue
    const cfv = [...(lead.custom_fields_values ?? [])]
    for (const f of u.custom_fields_values) {
      const values = (f.values as Array<{ value?: unknown; enum_id?: number }>).map(v =>
        v.enum_id != null
          ? { value: setup.periodField.enums?.find(e => e.id === v.enum_id)?.value ?? null, enum_id: v.enum_id }
          : { value: v.value })
      const i = cfv.findIndex(x => x.field_id === f.field_id)
      const entry = { field_id: f.field_id, values } as AmoCustomFieldValue
      if (i >= 0) cfv[i] = entry; else cfv.push(entry)
    }
    lead.custom_fields_values = cfv
  }
}

export async function warmRewardsCache() {
  const setup = await getSetup()
  await getRawDeals(setup)
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
  innSource:      InnSource | null
  managerId:      number
  manager:        string
  connectedOn:      string | null   // YYYY-MM-DD — дата регистрации в МегаФон (справочно)
  firstChargeMonth: number | null   // YYYYMM — первый месяц с начислениями
  fullMonth:      number | null   // YYYYMM первого полного месяца
  charges:        number          // копейки, без НДС, за выбранный период
  inReport:       boolean         // есть ли клиент в отчёте выбранного периода
  status:         AccrualStatus
  selectable:     boolean
  currentPeriod:  number | null
  currentAmount:  number | null   // копейки
  paid:           boolean
}

async function buildAccrual(period: number, force = false) {
  const setup = await getSetup()
  const deals = await getWonDeals(setup, force)
  const inns = [...new Set(deals.map(d => d.inn).filter((x): x is string => !!x))]

  // Данные МегаФон по ИНН: самая ранняя регистрация + начисления за период
  const meta = new Map<string, { firstReg: string | null; firstPeriod: number; firstCharge: number | null }>()
  const charges = new Map<string, number>()
  if (inns.length) {
    const innList = sql.join(inns.map(i => sql`${i}`), sql`, `)
    const m = await db
      .select({
        inn: megafonReportRows.clientInn,
        firstReg: sql<string | null>`min(${megafonReportRows.registrationDate})::text`,
        firstPeriod: sql<number>`min(${megafonReportRows.period})::int`,
        // первый месяц, в котором у клиента появились начисления
        firstCharge: sql<number | null>`(min(${megafonReportRows.period}) filter (where ${megafonReportRows.chargesMonth} > 0))::int`,
      })
      .from(megafonReportRows)
      .where(sql`${megafonReportRows.clientInn} in (${innList})`)
      .groupBy(megafonReportRows.clientInn)
    for (const r of m) if (r.inn) meta.set(r.inn, { firstReg: r.firstReg, firstPeriod: r.firstPeriod, firstCharge: r.firstCharge })

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

  const rows: AccrualRow[] = deals.map(({ lead, inn, innSource, company }) => {
    const mf = inn ? meta.get(inn) : undefined
    // Правило: отталкиваемся от месяца, в котором у клиента ПОШЛИ НАЧИСЛЕНИЯ
    // (по отчётам МегаФон). Он, как правило, неполный → платим за следующий.
    // Подключили в апреле, пользоваться начали в мае → полный месяц — июнь.
    const firstChargeMonth = mf?.firstCharge ?? null
    const fullMonth = firstChargeMonth == null ? null : addMonths(firstChargeMonth, 1)
    const connectedOn = mf?.firstReg ?? null

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
      innSource,
      managerId: lead.responsible_user_id,
      manager: names.get(lead.responsible_user_id) ?? `#${lead.responsible_user_id}`,
      connectedOn,
      firstChargeMonth,
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

/** Вознаграждение сотрудника в копейках, округлённое до рубля. Та же формула — на фронте. */
const rewardOf = (chargesKop: number, ratePct: number) => Math.round(chargesKop * ratePct / 100 / 100) * 100

// ───────────────────────── публичное API ─────────────────────────

export const rewardsService = {
  async preview(period: number, refresh = false) {
    const { setup, rows } = await buildAccrual(period, refresh)
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
  /**
   * Записывает период и вознаграждение в выбранные сделки.
   * Вознаграждение = начисления клиента × ставка сотрудника (%). Считаем на сервере.
   */
  async accrue(period: number, dealIds: number[], ratePct: number) {
    const { setup, rows } = await buildAccrual(period)
    const wanted = new Set(dealIds)
    const target = rows.filter(r => wanted.has(r.dealId) && r.selectable)
    if (!target.length) return { updated: 0, total: 0 }

    const periodVal = periodPayload(setup.periodField, period)
    const updates = target.map(r => ({
      id: r.dealId,
      custom_fields_values: [
        { field_id: setup.periodField.id, ...periodVal },
        { field_id: setup.rewardField.id, ...moneyPayload(setup.rewardField, rewardOf(r.charges, ratePct)) },
        ...(setup.paidField ? [{ field_id: setup.paidField.id, values: [{ value: false }] }] : []),
      ],
    }))
    await amocrm.patchLeads(updates)
    applyToCache(setup, updates)
    const total = target.reduce((s, r) => s + rewardOf(r.charges, ratePct), 0)
    logger.info('rewards accrued', { period, deals: target.length, total, ratePct })
    return { updated: target.length, total }
  },

  /** Сделки с начисленным вознаграждением (для отметки «выплачено»). */
  async payouts(period: number | null, refresh = false) {
    const setup = await getSetup()
    if (!setup.paidField) throw new Error('Не нашёл в сделках поле «Вознаграждение выплачено»')
    const deals = await getWonDeals(setup, refresh)
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
    const updates = dealIds.map(id => ({
      id,
      custom_fields_values: [{ field_id: setup.paidField!.id, values: [{ value: paid }] as unknown[] }],
    }))
    await amocrm.patchLeads(updates)
    applyToCache(setup, updates)
    logger.info('rewards paid flag', { deals: dealIds.length, paid })
    return { updated: dealIds.length }
  },
}
