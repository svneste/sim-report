import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  fetchSites,
  createSite,
  updateSite,
  deleteSite,
  fetchYandexReport,
  setClientMeta,
  type ClientMeta,
  type AmoFunnel,
  type YandexSite,
  type SiteForm,
  type YandexReport,
} from './api/yandex'

const num = (n: number) => n.toLocaleString('ru-RU')
const pct = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} %`

/** Итоги воронки amoCRM по всем группам отчёта (для KPI). */
function amoTotals(r: YandexReport) {
  return r.groups.reduce(
    (a, g) => ({ newRequests: a.newRequests + (g.funnel?.newRequests ?? 0), connected: a.connected + (g.funnel?.connected ?? 0) }),
    { newRequests: 0, connected: 0 },
  )
}

/** Дата YYYY-MM-DD (локальная), для дефолтного диапазона и input[type=date]. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function defaultFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 29)
  return ymd(d)
}

export function YandexMetricsPage() {
  const [sites, setSites]       = useState<YandexSite[]>([])
  const [siteId, setSiteId]     = useState<number | undefined>()
  const [from, setFrom]         = useState(defaultFrom())
  const [to, setTo]             = useState(ymd(new Date()))
  const [report, setReport]     = useState<YandexReport | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const loadSites = useCallback(async () => {
    try {
      const s = await fetchSites()
      setSites(s)
      return s
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return []
    }
  }, [])

  const loadReport = useCallback(async (id: number, f: string, t: string) => {
    setLoading(true)
    setError(null)
    try {
      setReport(await fetchYandexReport(id, f, t))
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Первичная загрузка: список сайтов + отчёт по первому.
  useEffect(() => {
    void loadSites().then(s => {
      if (s.length > 0) {
        setSiteId(s[0].id)
        void loadReport(s[0].id, from, to)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSites, loadReport])

  function applyFilters(id: number | undefined, f: string, t: string) {
    if (id == null) { setReport(null); return }
    void loadReport(id, f, t)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Аналитика сайтов · Яндекс Метрика</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Выбор сайта */}
          {sites.length > 0 && (
            <select
              value={siteId ?? ''}
              onChange={e => { const id = Number(e.target.value); setSiteId(id); applyFilters(id, from, to) }}
              className="h-8 px-2 rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Период */}
          <input
            type="date" value={from} max={to}
            onChange={e => { setFrom(e.target.value); applyFilters(siteId, e.target.value, to) }}
            className="h-8 px-2 rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <span className="text-zinc-400 text-sm">—</span>
          <input
            type="date" value={to} min={from}
            onChange={e => { setTo(e.target.value); applyFilters(siteId, from, e.target.value) }}
            className="h-8 px-2 rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />

          <button
            onClick={() => setManageOpen(true)}
            className="px-3 h-8 rounded-lg border border-zinc-200 bg-white text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Сайты ({sites.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Нет сайтов */}
      {sites.length === 0 && !error && (
        <div className="text-center py-16">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Сайты ещё не добавлены. Добавьте первый, чтобы видеть посетителей и конверсию.
          </p>
          <button
            onClick={() => setManageOpen(true)}
            className="px-4 h-9 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
          >
            Добавить сайт
          </button>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
              <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse mb-2" />
              <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Данные */}
      {!loading && report && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Kpi label="Посетителей" value={num(report.totals.visitors)} />
            <Kpi label={report.amocrmFunnel ? 'Заявки (amoCRM)' : 'Заявки (цель)'}
                 value={report.amocrmFunnel
                   ? num(amoTotals(report).newRequests)
                   : (report.site.hasGoal ? num(report.totals.leadsMetrika) : '—')}
                 hint={report.amocrmFunnel ? undefined : (report.site.hasGoal ? undefined : 'Цель не задана')}
                 color="text-blue-600 dark:text-blue-400" />
            <Kpi label="Конверсия"
                 value={report.amocrmFunnel
                   ? (report.totals.visitors > 0 ? pct(amoTotals(report).newRequests / report.totals.visitors * 100) : '—')
                   : (report.site.hasGoal ? pct(report.totals.conversionMetrika) : '—')}
                 color="text-emerald-600 dark:text-emerald-400" />
            <Kpi label={report.amocrmFunnel ? 'Подключено (amoCRM)' : 'Сделки amoCRM'}
                 value={report.amocrmFunnel
                   ? num(amoTotals(report).connected)
                   : (report.amocrm.configured ? num(report.amocrm.deals ?? 0) : '—')}
                 hint={report.amocrmFunnel ? undefined : (report.amocrm.configured ? undefined : 'Привязка не настроена')}
                 color="text-violet-600 dark:text-violet-400" />
          </div>

          {!report.site.hasGoal && !report.amocrmFunnel && (
            <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 text-sm">
              Для этого сайта не указана цель Метрики — заявки и конверсия по страницам не считаются.
              Укажите ID цели в настройках сайта.
            </div>
          )}

          {/* Таблица по клиентам (группам страниц) */}
          <PagesTable report={report} />

          {report.groups.length === 0 && (
            <div className="text-center py-16 text-sm text-zinc-500 dark:text-zinc-400">
              Нет данных за выбранный период.
            </div>
          )}
        </>
      )}

      {/* Управление сайтами */}
      {manageOpen && (
        <ManageSitesModal
          sites={sites}
          onClose={() => setManageOpen(false)}
          onChanged={async () => {
            const s = await loadSites()
            // если выбранный сайт удалён — переключаемся на первый
            const stillExists = siteId != null && s.some(x => x.id === siteId)
            const nextId = stillExists ? siteId : s[0]?.id
            setSiteId(nextId)
            applyFilters(nextId, from, to)
          }}
        />
      )}
    </div>
  )
}

// ===================== KPI-карточка =====================

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
      <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">{label}</div>
      <div className={`text-xl font-bold ${color ?? 'text-zinc-900 dark:text-zinc-100'}`}>{value}</div>
      {hint && <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">{hint}</div>}
    </div>
  )
}

// ===================== Таблица по страницам =====================

function PagesTable({ report }: { report: YandexReport }) {
  const siteId = report.site.id
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery]       = useState('')
  const [sort, setSort]         = useState<SortState>(null)
  // Локальный буфер ручных правок (по slug): и поля ввода, и оптимистичные значения.
  const [edits, setEdits]       = useState<Record<string, ClientMeta>>({})
  // Смена сайта — сбрасываем буфер (slug'и другие); данные снова придут из report.
  useEffect(() => { setEdits({}) }, [siteId])

  if (report.groups.length === 0) return null
  const hasGoal = report.site.hasGoal

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  type Group = YandexReport['groups'][number]
  type Field = keyof ClientMeta  // 'name' | 'createdDate' | 'launchDate'

  // Текущее отображаемое значение поля: правка из буфера, иначе значение с бэка.
  const valOf = (g: Group, f: Field) => edits[g.key]?.[f] ?? g[f] ?? ''
  const setEdit = (key: string, f: Field, v: string) =>
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], [f]: v } }))

  // Сохраняем все три поля на сервере при потере фокуса/Enter, только если что-то изменилось.
  const saveMeta = async (g: Group) => {
    const name        = valOf(g, 'name').trim()
    const createdDate = valOf(g, 'createdDate')
    const launchDate  = valOf(g, 'launchDate')
    if (name === (g.name ?? '') && createdDate === (g.createdDate ?? '') && launchDate === (g.launchDate ?? '')) return
    try {
      await setClientMeta(siteId, g.key, { name, createdDate, launchDate })
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  // Поиск: по адресу/slug, ручному названию и URL вложенных страниц.
  const q = query.trim().toLowerCase()
  const groups = q
    ? report.groups.filter(g =>
        g.label.toLowerCase().includes(q) ||
        g.key.toLowerCase().includes(q) ||
        valOf(g, 'name').toLowerCase().includes(q) ||
        g.pages.some(p => p.url.toLowerCase().includes(q)))
    : report.groups

  // Воронка amoCRM: флаг доступности, число колонок и итоги по всем группам.
  const af = report.amocrmFunnel
  const colCount = 7 + (af ? 7 : 0)

  // Клик по заголовку: новая колонка → убыв., повтор → возр., третий клик → сброс.
  const onSort = (k: SortKey) => setSort(prev =>
    prev?.key !== k ? { key: k, dir: 'desc' }
    : prev.dir === 'desc' ? { key: k, dir: 'asc' }
    : null)

  // Числовое значение группы для сортировки по выбранной колонке.
  const sortNum = (g: Group, k: SortKey): number => {
    const f = g.funnel
    switch (k) {
      case 'visitors':     return g.visitors
      case 'leads':        return af ? (f?.newRequests ?? 0) : g.leadsMetrika
      case 'conv':         return af ? (g.visitors > 0 ? (f?.newRequests ?? 0) / g.visitors : 0) : g.conversionMetrika
      case 'advanced':     return f?.advanced ?? 0
      case 'convAR':       return f && f.newRequests > 0 ? f.advanced / f.newRequests : 0
      case 'connected':    return f?.connected ?? 0
      case 'convRC':       return f && f.advanced > 0 ? f.connected / f.advanced : 0
      case 'connectedNew': return f?.connectedNew ?? 0
      case 'connectedMnp': return f?.connectedMnp ?? 0
      case 'lost':         return f?.lost ?? 0
      default:             return 0
    }
  }

  // Отсортированные группы (стабильно копируем перед sort); без сортировки — порядок с бэка.
  const sortedGroups = sort
    ? [...groups].sort((a, b) => {
        const r = sort.key === 'client'
          ? a.label.localeCompare(b.label, 'ru')
          : sortNum(a, sort.key) - sortNum(b, sort.key)
        return sort.dir === 'asc' ? r : -r
      })
    : groups
  const funnelTotals: AmoFunnel | null = af
    ? report.groups.reduce<AmoFunnel>((a, g) => ({
        newRequests:  a.newRequests  + (g.funnel?.newRequests  ?? 0),
        advanced:     a.advanced     + (g.funnel?.advanced     ?? 0),
        connected:    a.connected    + (g.funnel?.connected    ?? 0),
        connectedNew: a.connectedNew + (g.funnel?.connectedNew ?? 0),
        connectedMnp: a.connectedMnp + (g.funnel?.connectedMnp ?? 0),
        lost:         a.lost         + (g.funnel?.lost         ?? 0),
      }), { newRequests: 0, advanced: 0, connected: 0, connectedNew: 0, connectedMnp: 0, lost: 0 })
    : null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">По клиентам</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по адресу или названию…"
              className="h-8 w-64 pl-3 pr-7 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-[13px] leading-none"
                title="Очистить"
              >&#x2715;</button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(new Set(report.groups.map(g => g.key)))}
              className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >Развернуть всё</button>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <button
              onClick={() => setExpanded(new Set())}
              className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >Свернуть всё</button>
          </div>
        </div>
      </div>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <SortTh
                  k="client" label="Клиент / страница" sort={sort} onSort={onSort}
                  className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10" />
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-56">
                  Название
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-40">
                  Дата создания
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-40">
                  Дата запуска
                </th>
                <SortTh
                  k="visitors" label="Посетители" sort={sort} onSort={onSort}
                  className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28" />
                <SortTh
                  k="leads" label="Заявки" sort={sort} onSort={onSort}
                  className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28" />
                <SortTh
                  k="conv" label="Конверсия" sort={sort} onSort={onSort}
                  className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28" />
                {report.amocrmFunnel && (
                  <>
                    <SortTh
                      k="advanced" label="Ответили" title="amoCRM: клиент откликнулся — сделка прошла дальше «Нового обращения»" sort={sort} onSort={onSort}
                      className="border-b border-l-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-24" />
                    <SortTh
                      k="convAR" label="Заявка→ответ" title="Конверсия: из заявок ответили (Ответили ÷ Заявки)" sort={sort} onSort={onSort}
                      className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-400 dark:text-zinc-500 h-10 w-20" />
                    <SortTh
                      k="connected" label="Подключено" title="amoCRM: подключено — дошли до «Договор отправлен» или уже «Успешно»" sort={sort} onSort={onSort}
                      className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-24" />
                    <SortTh
                      k="convRC" label="Ответ→подкл" title="Конверсия: из ответивших подключились (Подключено ÷ Ответили)" sort={sort} onSort={onSort}
                      className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-400 dark:text-zinc-500 h-10 w-20" />
                    <SortTh
                      k="connectedNew" label="Подкл. новые" title="amoCRM: из подключённых — новые номера (MNP? = нет)" sort={sort} onSort={onSort}
                      className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-24" />
                    <SortTh
                      k="connectedMnp" label="Подкл. MNP" title="amoCRM: из подключённых — переносы номера (MNP? = да)" sort={sort} onSort={onSort}
                      className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-24" />
                    <SortTh
                      k="lost" label="Отказ" title="amoCRM: текущий статус «Не реализовано»" sort={sort} onSort={onSort}
                      className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-24" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-6 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
                    Ничего не найдено по «{query.trim()}»
                  </td>
                </tr>
              )}
              {sortedGroups.map(g => {
                const isOpen = q ? true : expanded.has(g.key)
                const expandable = g.pages.length > 1
                return (
                  <Fragment key={g.key}>
                    {/* Строка группы (клиент) */}
                    <tr
                      className={`border-b border-zinc-200 dark:border-zinc-800 group ${expandable ? 'cursor-pointer' : ''} hover:bg-zinc-50 dark:hover:bg-zinc-800/40`}
                      onClick={() => expandable && toggle(g.key)}
                    >
                      <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors max-w-[520px]">
                        <div className="h-[40px] flex items-center gap-2 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                          <span className={`shrink-0 w-4 inline-flex justify-center text-zinc-400 ${expandable ? '' : 'opacity-0'}`}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"
                                 className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                              <path d="M3.5 2L6.5 5L3.5 8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <span className="truncate" title={g.label}>{g.label}</span>
                          {g.key !== '__other__' && g.pages[0] && (
                            <a
                              href={g.pages[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title={`Открыть ${g.pages[0].url}`}
                              className="shrink-0 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          )}
                          {expandable && (
                            <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">
                              {g.pages.length} стр.
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border-l border-zinc-200 dark:border-zinc-800 px-2">
                        <input
                          value={valOf(g, 'name')}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setEdit(g.key, 'name', e.target.value)}
                          onBlur={() => void saveMeta(g)}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          placeholder="— название —"
                          className="w-full h-7 px-2 rounded-md border border-transparent bg-transparent text-[12px] text-zinc-800 placeholder:text-zinc-400 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white dark:text-zinc-200 dark:hover:border-zinc-700 dark:focus:border-zinc-600 dark:focus:bg-zinc-900 focus:outline-none transition-colors"
                        />
                      </td>
                      <td className="border-l border-zinc-200 dark:border-zinc-800 px-2">
                        <input
                          type="date"
                          value={valOf(g, 'createdDate')}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setEdit(g.key, 'createdDate', e.target.value)}
                          onBlur={() => void saveMeta(g)}
                          className="w-full h-7 px-2 rounded-md border border-transparent bg-transparent text-[12px] text-zinc-700 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white dark:text-zinc-300 dark:hover:border-zinc-700 dark:focus:border-zinc-600 dark:focus:bg-zinc-900 focus:outline-none transition-colors dark:[color-scheme:dark]"
                        />
                      </td>
                      <td className="border-l border-zinc-200 dark:border-zinc-800 px-2">
                        <input
                          type="date"
                          value={valOf(g, 'launchDate')}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setEdit(g.key, 'launchDate', e.target.value)}
                          onBlur={() => void saveMeta(g)}
                          className="w-full h-7 px-2 rounded-md border border-transparent bg-transparent text-[12px] text-zinc-700 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white dark:text-zinc-300 dark:hover:border-zinc-700 dark:focus:border-zinc-600 dark:focus:bg-zinc-900 focus:outline-none transition-colors dark:[color-scheme:dark]"
                        />
                      </td>
                      <Cell value={num(g.visitors)} className="text-zinc-800 dark:text-zinc-200 font-semibold" h={40} />
                      <Cell
                        value={af
                          ? num(g.funnel?.newRequests ?? 0)
                          : (hasGoal ? num(g.leadsMetrika) : '—')}
                        className="text-blue-600 dark:text-blue-400 font-semibold" h={40} />
                      <Cell
                        value={af
                          ? (g.visitors > 0 ? pct((g.funnel?.newRequests ?? 0) / g.visitors * 100) : '—')
                          : (hasGoal ? pct(g.conversionMetrika) : '—')}
                        className="text-emerald-700 dark:text-emerald-300 font-semibold" h={40} />
                      {af && <FunnelCells f={g.funnel} h={40} />}
                    </tr>
                    {/* Подстраницы */}
                    {isOpen && g.pages.map(p => (
                      <tr key={p.url} className="border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/40 group">
                        <td className="sticky left-0 z-10 bg-zinc-50/40 dark:bg-zinc-900/40 border-r border-zinc-200 dark:border-zinc-800 px-4 max-w-[520px]">
                          <div className="h-[34px] flex items-center pl-6 text-[12px] text-zinc-500 dark:text-zinc-400 truncate" title={p.url}>
                            {p.url}
                          </div>
                        </td>
                        <td className="border-l border-zinc-200 dark:border-zinc-800" />
                        <td className="border-l border-zinc-200 dark:border-zinc-800" />
                        <td className="border-l border-zinc-200 dark:border-zinc-800" />
                        <Cell value={num(p.visitors)} className="text-zinc-500 dark:text-zinc-400" h={34} />
                        <Cell value={af ? '' : (hasGoal ? num(p.leadsMetrika) : '—')} className="text-blue-500/80 dark:text-blue-400/80" h={34} />
                        <Cell value={af ? '' : (hasGoal ? pct(p.conversionMetrika) : '—')} className="text-emerald-600/80 dark:text-emerald-300/80" h={34} />
                        {af && <FunnelCells f={null} h={34} blank />}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {/* Итого */}
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                  <div className="h-[40px] flex items-center pl-6 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                </td>
                <td className="border-l border-zinc-200 dark:border-zinc-800" />
                <td className="border-l border-zinc-200 dark:border-zinc-800" />
                <td className="border-l border-zinc-200 dark:border-zinc-800" />
                <Cell value={num(report.totals.visitors)} className="text-zinc-900 dark:text-zinc-100 font-bold" h={40} />
                <Cell
                  value={af
                    ? num(funnelTotals?.newRequests ?? 0)
                    : (hasGoal ? num(report.totals.leadsMetrika) : '—')}
                  className="text-blue-600 dark:text-blue-400 font-bold" h={40} />
                <Cell
                  value={af
                    ? (report.totals.visitors > 0 ? pct((funnelTotals?.newRequests ?? 0) / report.totals.visitors * 100) : '—')
                    : (hasGoal ? pct(report.totals.conversionMetrika) : '—')}
                  className="text-emerald-600 dark:text-emerald-400 font-bold" h={40} />
                {af && <FunnelCells f={funnelTotals} h={40} bold />}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Колонки, по которым доступна сортировка кликом по заголовку.
type SortKey =
  | 'client' | 'visitors' | 'leads' | 'conv'
  | 'advanced' | 'convAR' | 'connected' | 'convRC' | 'connectedNew' | 'connectedMnp' | 'lost'
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null

/** Индикатор сортировки: активная стрелка ▲/▼, иначе бледный ▼ при наведении на заголовок. */
function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' | null }) {
  return (
    <span className={`text-[8px] leading-none ${active
      ? 'opacity-100 text-zinc-700 dark:text-zinc-200'
      : 'opacity-0 group-hover/th:opacity-40'}`}>
      {dir === 'asc' ? '▲' : '▼'}
    </span>
  )
}

/** Кликабельный заголовок-колонка с индикатором сортировки. */
function SortTh({ k, label, className, title, sort, onSort }: {
  k: SortKey; label: string; className: string; title?: string
  sort: SortState; onSort: (k: SortKey) => void
}) {
  const active = sort?.key === k
  return (
    <th
      title={title}
      onClick={() => onSort(k)}
      className={`${className} cursor-pointer select-none group/th transition-colors hover:text-zinc-700 dark:hover:text-zinc-200`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortArrow active={active} dir={active ? sort!.dir : null} />
      </span>
    </th>
  )
}

/** Числовая ячейка таблицы (выравнивание по правому краю). */
function Cell({ value, className, h }: { value: string; className?: string; h: number }) {
  return (
    <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
      <div className={`flex items-center justify-end text-[12px] ${className ?? ''}`} style={{ height: h }}>
        {value}
      </div>
    </td>
  )
}

/** Ячейка воронки amoCRM (поуже, у первой — усиленная левая граница-разделитель). */
function FCell({ value, h, first, className }: { value: string; h: number; first?: boolean; className?: string }) {
  const border = first ? 'border-l-2 border-zinc-300 dark:border-zinc-700' : 'border-l border-zinc-200 dark:border-zinc-800'
  return (
    <td className={`${border} px-3 text-right`}>
      <div className={`flex items-center justify-end text-[12px] ${className ?? ''}`} style={{ height: h }}>{value}</div>
    </td>
  )
}

/** Конверсия между этапами воронки: numer ÷ denom в %, '—' если делить не на что. */
const fconv = (numer: number, denom: number) => denom > 0 ? pct(numer / denom * 100) : '—'

/** Семь ячеек воронки amoCRM: Ответили · Заявка→ответ · Подключено · Ответ→подкл · Подкл. новые · Подкл. MNP · Отказ. */
function FunnelCells({ f, h, blank, bold }: { f: AmoFunnel | null; h: number; blank?: boolean; bold?: boolean }) {
  if (blank) return <>{[0, 1, 2, 3, 4, 5, 6].map(i => <FCell key={i} first={i === 0} value="" h={h} />)}</>
  const b = bold ? ' font-bold' : ''
  return (
    <>
      <FCell first value={f ? num(f.advanced) : '—'}                  h={h} className={'text-zinc-600 dark:text-zinc-400' + b} />
      <FCell       value={f ? fconv(f.advanced, f.newRequests) : '—'} h={h} className={'text-zinc-400 dark:text-zinc-500' + b} />
      <FCell       value={f ? num(f.connected) : '—'}                 h={h} className={'text-emerald-600 dark:text-emerald-400 font-semibold' + b} />
      <FCell       value={f ? fconv(f.connected, f.advanced) : '—'}   h={h} className={'text-zinc-400 dark:text-zinc-500' + b} />
      <FCell       value={f ? num(f.connectedNew) : '—'}              h={h} className={'text-emerald-700/80 dark:text-emerald-300/80' + b} />
      <FCell       value={f ? num(f.connectedMnp) : '—'}              h={h} className={'text-cyan-600 dark:text-cyan-400' + b} />
      <FCell       value={f ? num(f.lost) : '—'}                      h={h} className={'text-rose-500 dark:text-rose-400' + b} />
    </>
  )
}

// ===================== Модалка управления сайтами =====================

const EMPTY_FORM: SiteForm = { name: '', counterId: 0, goalId: null, domain: null, amocrmPipelineId: null, amocrmPageFieldId: null }

function ManageSitesModal({ sites, onClose, onChanged }: {
  sites: YandexSite[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const [editing, setEditing] = useState<YandexSite | null>(null)
  const [form, setForm]       = useState<SiteForm>(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  function startNew() { setEditing(null); setForm(EMPTY_FORM); setErr(null) }
  function startEdit(s: YandexSite) {
    setEditing(s)
    setForm({ name: s.name, counterId: s.counterId, goalId: s.goalId, domain: s.domain, amocrmPipelineId: s.amocrmPipelineId, amocrmPageFieldId: s.amocrmPageFieldId })
    setErr(null)
  }

  async function save() {
    setSaving(true); setErr(null)
    try {
      if (editing) await updateSite(editing.id, form)
      else await createSite(form)
      await onChanged()
      startNew()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: YandexSite) {
    if (!confirm(`Удалить сайт «${s.name}»?`)) return
    try {
      await deleteSite(s.id)
      await onChanged()
      if (editing?.id === s.id) startNew()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  // Управляемое числовое поле: пустая строка → null
  const numField = (v: number | null | undefined) => (v == null ? '' : String(v))
  const onNum = (key: keyof SiteForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value ? Number(e.target.value) : null }))

  const inputCls = 'w-full h-9 px-3 rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
  const labelCls = 'text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 block'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-950">
          <span className="text-sm font-semibold">Управление сайтами</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">&#x2715;</button>
        </div>

        {/* Список */}
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          {sites.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400 py-2">Сайтов пока нет.</div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sites.map(s => (
                <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{s.name}</div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      счётчик {s.counterId}{s.goalId ? ` · цель ${s.goalId}` : ' · без цели'}{s.domain ? ` · ${s.domain}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => startEdit(s)} className="px-2 py-1 text-[11px] rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Изменить</button>
                    <button onClick={() => remove(s)} className="px-2 py-1 text-[11px] rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/40">Удалить</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Форма */}
        <div className="px-5 py-4">
          <div className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
            {editing ? `Редактирование: ${editing.name}` : 'Новый сайт'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Название *</label>
              <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="МегаФон Корпоративный" />
            </div>
            <div>
              <label className={labelCls}>ID счётчика Метрики *</label>
              <input className={inputCls} type="number" value={form.counterId || ''} onChange={onNum('counterId')} placeholder="12345678" />
            </div>
            <div>
              <label className={labelCls}>ID цели (заявка)</label>
              <input className={inputCls} type="number" value={numField(form.goalId)} onChange={onNum('goalId')} placeholder="необязательно" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Домен</label>
              <input className={inputCls} value={form.domain ?? ''} onChange={e => setForm(f => ({ ...f, domain: e.target.value || null }))} placeholder="megafon-corporate.ru" />
            </div>
            <div>
              <label className={labelCls}>amoCRM: ID воронки</label>
              <input className={inputCls} type="number" value={numField(form.amocrmPipelineId)} onChange={onNum('amocrmPipelineId')} placeholder="необязательно" />
            </div>
            <div>
              <label className={labelCls}>amoCRM: ID поля с URL</label>
              <input className={inputCls} type="number" value={numField(form.amocrmPageFieldId)} onChange={onNum('amocrmPageFieldId')} placeholder="необязательно" />
            </div>
          </div>

          {err && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</div>}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !form.name || !form.counterId}
              className="px-4 h-9 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Добавить'}
            </button>
            {editing && (
              <button onClick={startNew} className="px-4 h-9 rounded-lg border border-zinc-200 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                Отмена
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
