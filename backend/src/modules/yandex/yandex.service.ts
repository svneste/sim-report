import { db } from '../../db/client.js'
import { yandexSites } from '../../db/schema.js'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { eq, asc, sql } from 'drizzle-orm'

// ===================== Яндекс Метрика API =====================

const METRIKA_BASE = 'https://api-metrika.yandex.net'

/**
 * Обёртка над Reporting API Метрики. Авторизация — OAuth-токеном из config
 * (один на все счётчики). Кидает понятную ошибку, если токен пуст или
 * Метрика ответила не 2xx (частые причины: 401 — токен невалиден/протух,
 * 403 — нет доступа к счётчику, 429 — превышен лимит запросов).
 */
async function metrikaRequest<T>(path: string): Promise<T> {
  if (!config.YANDEX_OAUTH_TOKEN) {
    throw new Error('YANDEX_OAUTH_TOKEN не задан. Добавьте OAuth-токен Яндекс Метрики в .env бэкенда.')
  }
  const res = await fetch(`${METRIKA_BASE}${path}`, {
    headers: { Authorization: `OAuth ${config.YANDEX_OAUTH_TOKEN}` },
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 401) throw new Error('Яндекс Метрика: токен недействителен (401). Обновите YANDEX_OAUTH_TOKEN.')
    if (res.status === 403) throw new Error('Яндекс Метрика: нет доступа к счётчику (403). Проверьте права токена и номер счётчика.')
    throw new Error(`Яндекс Метрика API ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

/** Ответ Reporting API /stat/v1/data (только нужные поля). */
interface StatDataResponse {
  data: Array<{
    dimensions: Array<{ name: string | null }>
    metrics: number[]
  }>
  totals: number[]
  total_rows: number
}

/** Дата в формате YYYY-MM-DD (локальная). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Диапазон по умолчанию — последние 30 дней включительно. */
function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return { from: ymd(from), to: ymd(to) }
}

// ===================== Типы вход/выход =====================

export interface SiteInput {
  name:              string
  counterId:         number
  goalId?:           number | null
  domain?:           string | null
  amocrmPipelineId?: number | null
  amocrmPageFieldId?: number | null
}

export interface PageRow {
  url:               string
  visitors:          number   // ym:s:users
  visits:            number    // ym:s:visits
  leadsMetrika:      number    // достижения цели (если goalId задан), иначе 0
  conversionMetrika: number    // leadsMetrika / visits * 100
}

export interface YandexReport {
  site:    { id: number; name: string; counterId: number; goalId: number | null; hasGoal: boolean }
  from:    string
  to:      string
  totals:  { visitors: number; visits: number; leadsMetrika: number; conversionMetrika: number }
  pages:   PageRow[]
  amocrm:  { configured: boolean; deals: number | null }  // site-level число сделок (если привязка настроена)
}

// ===================== Service =====================

export const yandexService = {
  // -------- CRUD сайтов --------

  async listSites() {
    return db.select().from(yandexSites).orderBy(asc(yandexSites.name))
  },

  async createSite(input: SiteInput) {
    const [row] = await db.insert(yandexSites).values({
      name:              input.name,
      counterId:         input.counterId,
      goalId:            input.goalId ?? null,
      domain:            input.domain ?? null,
      amocrmPipelineId:  input.amocrmPipelineId ?? null,
      amocrmPageFieldId: input.amocrmPageFieldId ?? null,
    }).returning()
    logger.info(`[yandex] site created #${row.id}: ${row.name} (counter ${row.counterId})`)
    return row
  },

  async updateSite(id: number, input: SiteInput) {
    const [row] = await db.update(yandexSites).set({
      name:              input.name,
      counterId:         input.counterId,
      goalId:            input.goalId ?? null,
      domain:            input.domain ?? null,
      amocrmPipelineId:  input.amocrmPipelineId ?? null,
      amocrmPageFieldId: input.amocrmPageFieldId ?? null,
    }).where(eq(yandexSites.id, id)).returning()
    if (!row) throw new Error('Сайт не найден')
    return row
  },

  async deleteSite(id: number) {
    const [row] = await db.delete(yandexSites).where(eq(yandexSites.id, id)).returning()
    if (!row) return { deleted: false, error: 'Сайт не найден' }
    logger.info(`[yandex] site deleted #${id}: ${row.name}`)
    return { deleted: true, name: row.name }
  },

  // -------- Отчёт по страницам --------

  /**
   * Отчёт по страницам сайта за период:
   *   - посетители/визиты по каждой странице (dimension ym:s:startURL);
   *   - заявки = достижения цели сайта (если задан goalId);
   *   - конверсия = заявки / визиты * 100.
   * Плюс site-level число сделок amoCRM (если у сайта настроена привязка).
   */
  async getReport(siteId: number, from?: string, to?: string): Promise<YandexReport> {
    const [site] = await db.select().from(yandexSites).where(eq(yandexSites.id, siteId))
    if (!site) throw new Error('Сайт не найден')

    const range = from && to ? { from, to } : defaultRange()
    const hasGoal = site.goalId != null

    // metrics: визиты, посетители (+ достижения цели, если задана)
    const metrics = ['ym:s:visits', 'ym:s:users']
    if (hasGoal) metrics.push(`ym:s:goal${site.goalId}reaches`)

    const params = new URLSearchParams()
    params.set('ids',        String(site.counterId))
    params.set('dimensions', 'ym:s:startURL')
    params.set('metrics',    metrics.join(','))
    params.set('date1',      range.from)
    params.set('date2',      range.to)
    params.set('sort',       '-ym:s:visits')
    params.set('limit',      '300')
    params.set('accuracy',   'full')

    const resp = await metrikaRequest<StatDataResponse>(`/stat/v1/data?${params.toString()}`)

    const pages: PageRow[] = resp.data.map(d => {
      const visits   = d.metrics[0] ?? 0
      const visitors = d.metrics[1] ?? 0
      const leads    = hasGoal ? (d.metrics[2] ?? 0) : 0
      return {
        url:               d.dimensions[0]?.name ?? '—',
        visits,
        visitors,
        leadsMetrika:      leads,
        conversionMetrika: visits > 0 ? (leads / visits) * 100 : 0,
      }
    })

    const tVisits   = resp.totals[0] ?? 0
    const tVisitors = resp.totals[1] ?? 0
    const tLeads    = hasGoal ? (resp.totals[2] ?? 0) : 0

    // amoCRM: число сделок за период (site-level). Привязка опциональна.
    const amocrm = await this.countAmocrmDeals(site, range.from, range.to)

    return {
      site: { id: site.id, name: site.name, counterId: site.counterId, goalId: site.goalId, hasGoal },
      from: range.from,
      to:   range.to,
      totals: {
        visitors:          tVisitors,
        visits:            tVisits,
        leadsMetrika:      tLeads,
        conversionMetrika: tVisits > 0 ? (tLeads / tVisits) * 100 : 0,
      },
      pages,
      amocrm,
    }
  },

  /**
   * Считает сделки amoCRM за период (best-effort, site-level).
   * Требует, чтобы воронка сайта была настроена И синхронизировалась в
   * таблицу amocrm_deals (sync тянет только AMOCRM_PIPELINE_ID — для других
   * воронок результат будет 0, пока их не начнут синкать).
   *
   * Если заданы domain + amocrmPageFieldId — фильтрует сделки, у которых в
   * кастом-поле лежит этот домен/URL. Иначе считает все сделки воронки.
   */
  async countAmocrmDeals(
    site: { amocrmPipelineId: number | null; amocrmPageFieldId: number | null; domain: string | null },
    from: string,
    to: string,
  ): Promise<{ configured: boolean; deals: number | null }> {
    if (site.amocrmPipelineId == null) return { configured: false, deals: null }

    // to — конец дня включительно
    const conds = [
      sql`pipeline_id = ${site.amocrmPipelineId}`,
      sql`created_at >= ${from}::date`,
      sql`created_at < (${to}::date + interval '1 day')`,
    ]

    if (site.amocrmPageFieldId != null && site.domain) {
      conds.push(sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(raw->'custom_fields_values') cf
        WHERE (cf->>'field_id')::bigint = ${site.amocrmPageFieldId}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(cf->'values') v
            WHERE v->>'value' ILIKE ${'%' + site.domain + '%'}
          )
      )`)
    }

    const whereSql = conds.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} AND ${c}`))
    const res = await db.execute(sql`SELECT count(*)::int AS c FROM amocrm_deals WHERE ${whereSql}`)
    const rows = (res as unknown as { rows?: Array<{ c: number }> }).rows
              ?? (res as unknown as Array<{ c: number }>)
    const deals = Array.isArray(rows) ? (rows[0]?.c ?? 0) : 0
    return { configured: true, deals }
  },
}
