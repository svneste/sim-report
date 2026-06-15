import { db } from '../../db/client.js'
import { yandexSites, yandexClientNames } from '../../db/schema.js'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { eq, and, asc, sql } from 'drizzle-orm'

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

/** Группа страниц по первому сегменту пути (= «адрес клиента», напр. /rzd). */
export interface PageGroup {
  key:               string    // 'rzd'
  label:             string    // '/rzd'
  name:              string | null  // ручное название клиента (если задано), напр. «РЖД»
  visitors:          number    // сумма по подстраницам (приближение по уникальным)
  visits:            number
  leadsMetrika:      number
  conversionMetrika: number
  pages:             PageRow[]  // подстраницы, отсортированы по визитам
}

export interface YandexReport {
  site:    { id: number; name: string; counterId: number; goalId: number | null; hasGoal: boolean }
  from:    string
  to:      string
  totals:  { visitors: number; visits: number; leadsMetrika: number; conversionMetrika: number }
  groups:  PageGroup[]
  amocrm:  { configured: boolean; deals: number | null }  // site-level число сделок (если привязка настроена)
}

/** Ключ бакета «Прочее» — куда сводятся малотрафиковые/ошибочные адреса. */
const OTHER_KEY = '__other__'
/** Группа с числом визитов ≤ этого порога считается «редким/ошибочным» адресом. */
const RARE_VISITS = 2

/**
 * Сводит полный URL к ключу группы — первому сегменту пути («адрес клиента»).
 * Отрезает протокол+домен, query (?...), hash (#...), завершающий слэш, а также
 * «мусорную» пунктуацию по краям сегмента («/akron,» → «akron»).
 *   https://site.ru/rzd/mnp?a=1   → { key:'rzd',  label:'/rzd' }
 *   https://site.ru/nlstar-int/   → { key:'nlstar-int', label:'/nlstar-int' }
 *   https://site.ru/akron#!/tab/1 → { key:'akron', label:'/akron' }
 *   https://site.ru/akron,        → { key:'akron', label:'/akron' }
 *   https://site.ru/  (или /)     → { key:'/',     label:'Главная' }
 * /rzd и /rzdff остаются разными группами.
 */
function groupKeyOf(url: string): { key: string; label: string } {
  const m = url.match(/^https?:\/\/[^/]+(\/.*)?$/i)
  let path = m ? (m[1] ?? '/') : url
  path = path.split('?')[0].split('#')[0]
  let seg = path.split('/').filter(Boolean)[0] ?? ''
  // Срезаем не-буквенно-цифровые символы по краям (запятые, точки, скобки и т.п.),
  // сохраняя внутренние дефисы: «akron,» → «akron», «nlstar-int» остаётся как есть.
  seg = seg.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!seg) return { key: '/', label: 'Главная' }
  return { key: seg.toLowerCase(), label: '/' + seg }
}

/**
 * Группирует страницы по первому сегменту пути; внутри и между группами сортирует по визитам.
 * Малотрафиковые группы (≤ RARE_VISITS визитов) — обычно опечатки/ошибочные адреса —
 * сводятся в единый бакет «Прочее» в конце списка, чтобы не засорять перечень клиентов.
 * «Главная» (key '/') в бакет не попадает.
 */
function groupPages(pages: PageRow[]): PageGroup[] {
  const map = new Map<string, PageGroup>()
  for (const p of pages) {
    const { key, label } = groupKeyOf(p.url)
    let g = map.get(key)
    if (!g) {
      g = { key, label, name: null, visitors: 0, visits: 0, leadsMetrika: 0, conversionMetrika: 0, pages: [] }
      map.set(key, g)
    }
    g.visitors     += p.visitors
    g.visits       += p.visits
    g.leadsMetrika += p.leadsMetrika
    g.pages.push(p)
  }

  const normal: PageGroup[] = []
  const rare:   PageGroup[] = []
  for (const g of map.values()) {
    if (g.key !== '/' && g.visits <= RARE_VISITS) rare.push(g)
    else normal.push(g)
  }

  for (const g of normal) {
    g.conversionMetrika = g.visits > 0 ? (g.leadsMetrika / g.visits) * 100 : 0
    g.pages.sort((a, b) => b.visits - a.visits)
  }
  normal.sort((a, b) => b.visits - a.visits)

  if (rare.length > 0) {
    const bucket: PageGroup = {
      key: OTHER_KEY,
      label: `Прочее (редкие адреса · ${rare.length})`,
      name: null,
      visitors: 0, visits: 0, leadsMetrika: 0, conversionMetrika: 0, pages: [],
    }
    for (const g of rare) {
      bucket.visitors     += g.visitors
      bucket.visits       += g.visits
      bucket.leadsMetrika += g.leadsMetrika
      bucket.pages.push(...g.pages)
    }
    bucket.conversionMetrika = bucket.visits > 0 ? (bucket.leadsMetrika / bucket.visits) * 100 : 0
    bucket.pages.sort((a, b) => b.visits - a.visits)
    normal.push(bucket)  // всегда в конце списка
  }

  return normal
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

    // Ручные названия клиентов (по slug, независимы от периода) — подмешиваем в группы.
    const names = await db.select().from(yandexClientNames).where(eq(yandexClientNames.siteId, siteId))
    const nameBySlug = new Map(names.map(n => [n.slug, n.name]))
    const groups = groupPages(pages)
    for (const g of groups) g.name = nameBySlug.get(g.key) ?? null

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
      groups,
      amocrm,
    }
  },

  /**
   * Задаёт/очищает ручное название клиента для группы (slug) сайта.
   * Пустое имя → удаляем запись (название сбрасывается). Иначе — upsert по (siteId, slug).
   */
  async setClientName(siteId: number, slug: string, name: string) {
    const [site] = await db.select({ id: yandexSites.id }).from(yandexSites).where(eq(yandexSites.id, siteId))
    if (!site) throw new Error('Сайт не найден')

    const trimmed = name.trim()
    if (!trimmed) {
      await db.delete(yandexClientNames)
        .where(and(eq(yandexClientNames.siteId, siteId), eq(yandexClientNames.slug, slug)))
      return { siteId, slug, name: null }
    }

    await db.insert(yandexClientNames)
      .values({ siteId, slug, name: trimmed })
      .onConflictDoUpdate({
        target: [yandexClientNames.siteId, yandexClientNames.slug],
        set: { name: trimmed, updatedAt: sql`now()` },
      })
    return { siteId, slug, name: trimmed }
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
