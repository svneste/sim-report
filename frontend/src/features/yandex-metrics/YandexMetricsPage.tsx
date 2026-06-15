import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  fetchSites,
  createSite,
  updateSite,
  deleteSite,
  fetchYandexReport,
  setClientName,
  type YandexSite,
  type SiteForm,
  type YandexReport,
} from './api/yandex'

const num = (n: number) => n.toLocaleString('ru-RU')
const pct = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} %`

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
            <Kpi label="Заявки (цель)" value={report.site.hasGoal ? num(report.totals.leadsMetrika) : '—'}
                 hint={report.site.hasGoal ? undefined : 'Цель не задана'} color="text-blue-600 dark:text-blue-400" />
            <Kpi label="Конверсия" value={report.site.hasGoal ? pct(report.totals.conversionMetrika) : '—'}
                 color="text-emerald-600 dark:text-emerald-400" />
            <Kpi label="Сделки amoCRM" value={report.amocrm.configured ? num(report.amocrm.deals ?? 0) : '—'}
                 hint={report.amocrm.configured ? undefined : 'Привязка не настроена'} color="text-violet-600 dark:text-violet-400" />
          </div>

          {!report.site.hasGoal && (
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
  // Локальный буфер ручных названий (по slug): и поле ввода, и оптимистичное значение.
  const [names, setNames]       = useState<Record<string, string>>({})
  // Смена сайта — сбрасываем буфер (slug'и другие); названия снова придут из report.
  useEffect(() => { setNames({}) }, [siteId])

  if (report.groups.length === 0) return null
  const hasGoal = report.site.hasGoal

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // Текущее отображаемое название группы: правка из буфера, иначе значение с бэка.
  const nameOf = (g: YandexReport['groups'][number]) => names[g.key] ?? g.name ?? ''

  // Сохраняем название на сервере при потере фокуса/Enter, только если оно изменилось.
  const saveName = async (g: YandexReport['groups'][number]) => {
    const value = (names[g.key] ?? g.name ?? '').trim()
    if (value === (g.name ?? '')) return
    try {
      await setClientName(siteId, g.key, value)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  // Поиск: по названию группы (slug), ручному имени и URL вложенных страниц.
  const q = query.trim().toLowerCase()
  const groups = q
    ? report.groups.filter(g =>
        g.label.toLowerCase().includes(q) ||
        g.key.toLowerCase().includes(q) ||
        nameOf(g).toLowerCase().includes(q) ||
        g.pages.some(p => p.url.toLowerCase().includes(q)))
    : report.groups

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
                <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10">
                  Клиент / страница
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-56">
                  Название
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28">
                  Посетители
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28">
                  Заявки
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28">
                  Конверсия
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
                    Ничего не найдено по «{query.trim()}»
                  </td>
                </tr>
              )}
              {groups.map(g => {
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
                          value={nameOf(g)}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { const v = e.target.value; setNames(p => ({ ...p, [g.key]: v })) }}
                          onBlur={() => void saveName(g)}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          placeholder="— название —"
                          className="w-full h-7 px-2 rounded-md border border-transparent bg-transparent text-[12px] text-zinc-800 placeholder:text-zinc-400 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white dark:text-zinc-200 dark:hover:border-zinc-700 dark:focus:border-zinc-600 dark:focus:bg-zinc-900 focus:outline-none transition-colors"
                        />
                      </td>
                      <Cell value={num(g.visitors)} className="text-zinc-800 dark:text-zinc-200 font-semibold" h={40} />
                      <Cell value={hasGoal ? num(g.leadsMetrika) : '—'} className="text-blue-600 dark:text-blue-400 font-semibold" h={40} />
                      <Cell value={hasGoal ? pct(g.conversionMetrika) : '—'} className="text-emerald-700 dark:text-emerald-300 font-semibold" h={40} />
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
                        <Cell value={num(p.visitors)} className="text-zinc-500 dark:text-zinc-400" h={34} />
                        <Cell value={hasGoal ? num(p.leadsMetrika) : '—'} className="text-blue-500/80 dark:text-blue-400/80" h={34} />
                        <Cell value={hasGoal ? pct(p.conversionMetrika) : '—'} className="text-emerald-600/80 dark:text-emerald-300/80" h={34} />
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
                <Cell value={num(report.totals.visitors)} className="text-zinc-900 dark:text-zinc-100 font-bold" h={40} />
                <Cell value={hasGoal ? num(report.totals.leadsMetrika) : '—'} className="text-blue-600 dark:text-blue-400 font-bold" h={40} />
                <Cell value={hasGoal ? pct(report.totals.conversionMetrika) : '—'} className="text-emerald-600 dark:text-emerald-400 font-bold" h={40} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
