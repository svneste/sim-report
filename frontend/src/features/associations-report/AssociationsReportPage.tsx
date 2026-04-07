import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DAY_NAMES_SHORT,
  MONTH_NAMES_NOM,
  dayOfWeekMon0,
  daysInMonth,
} from '../../shared/lib/date'
import { runSync } from '../sim-calendar/api/simReport'
import {
  fetchAssociationsReport,
  type AssociationOption,
  type AssociationRow,
} from './api/associationsReport'
import { AssociationFilter } from './AssociationFilter'

const PAGE_SIZE = 15

export function AssociationsReportPage() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const year   = view.getFullYear()
  const month0 = view.getMonth()
  const month1 = month0 + 1

  const [rows, setRows]               = useState<AssociationRow[]>([])
  const [allOptions, setAllOptions]   = useState<AssociationOption[]>([])
  const [selected, setSelected]       = useState<Set<string>>(() => new Set())
  const [totalGroups, setTotalGroups] = useState(0)
  const [grandTotal, setGrandTotal]   = useState(0)
  const [hasMore, setHasMore]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [syncing, setSyncing]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [reloadCounter, setReloadCounter] = useState(0)

  // Сериализованный snapshot выбранных — чтобы не плодить эффекты на Set
  const selectedKey = useMemo(() => Array.from(selected).sort().join('|||'), [selected])

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month1) }, (_, i) => i + 1),
    [year, month1],
  )

  const isWeekend = (d: number) => dayOfWeekMon0(year, month0, d) >= 5
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month0 && today.getDate() === d

  // Первоначальная загрузка / смена месяца / refresh / смена фильтра
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const sel = selectedKey ? selectedKey.split('|||') : []
    fetchAssociationsReport(year, month1, PAGE_SIZE, 0, sel)
      .then(r => {
        if (cancelled) return
        setRows(r.rows)
        setAllOptions(r.allOptions)
        setTotalGroups(r.totalGroups)
        setGrandTotal(r.grandTotal)
        setHasMore(r.hasMore)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month1, reloadCounter, selectedKey])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    setError(null)
    try {
      // При активном фильтре пагинации нет — но проверяем на всякий случай
      const r = await fetchAssociationsReport(year, month1, PAGE_SIZE, rows.length, [])
      setRows(prev => [...prev, ...r.rows])
      setAllOptions(r.allOptions)
      setHasMore(r.hasMore)
      setTotalGroups(r.totalGroups)
      setGrandTotal(r.grandTotal)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }, [year, month1, rows.length, loadingMore, hasMore])

  async function handleRefresh() {
    setSyncing(true)
    setError(null)
    try {
      await runSync(6)
      setReloadCounter(c => c + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  function prev() { setView(new Date(year, month0 - 1, 1)) }
  function next() { setView(new Date(year, month0 + 1, 1)) }

  // Сумма по дням всех загруженных строк (для строки "Итого")
  const dayTotals = useMemo(() => {
    const t: Record<number, number> = {}
    for (const r of rows) {
      for (const [d, c] of Object.entries(r.counts)) {
        const dd = Number(d)
        t[dd] = (t[dd] ?? 0) + c
      }
    }
    return t
  }, [rows])
  const loadedTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows])

  const monthLabel = `${MONTH_NAMES_NOM[month0]} ${year}`
  const busy = loading || syncing

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Заявки по объединениям</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <AssociationFilter
            options={allOptions}
            selected={selected}
            onChange={setSelected}
            disabled={busy}
          />
          <button
            onClick={prev}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >‹</button>
          <div className="min-w-[160px] text-center text-sm font-semibold">
            {monthLabel}{busy && ' …'}
          </div>
          <button
            onClick={next}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >›</button>
          <button
            onClick={() => void handleRefresh()}
            disabled={busy}
            className="ml-2 px-3 h-8 rounded-lg border border-zinc-200 bg-white text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            title="Запросить актуальные данные из amoCRM"
          >
            {syncing ? 'Синхронизация…' : 'Обновить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  style={{ width: 280, minWidth: 280, height: 48 }}
                >
                  Объединение
                </th>
                {days.map(d => (
                  <th
                    key={d}
                    className={`border-b border-l border-zinc-200 dark:border-zinc-800 p-0 text-center ${
                      isWeekend(d)
                        ? 'bg-zinc-100/60 dark:bg-zinc-800/40'
                        : 'bg-zinc-50 dark:bg-zinc-900'
                    }`}
                    style={{ width: 42, minWidth: 42 }}
                  >
                    <div className="flex flex-col items-center justify-center gap-0.5 py-1.5">
                      <span
                        className={`text-[11px] leading-none font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday(d)
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : isWeekend(d)
                              ? 'text-zinc-400 dark:text-zinc-500'
                              : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                      >{d}</span>
                      <span className={`text-[9px] leading-none uppercase tracking-wide ${
                        isWeekend(d)
                          ? 'text-zinc-400 dark:text-zinc-600'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}>
                        {DAY_NAMES_SHORT[dayOfWeekMon0(year, month0, d)]}
                      </span>
                    </div>
                  </th>
                ))}
                <th
                  className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  style={{ width: 64, minWidth: 64 }}
                >
                  Итого
                </th>
              </tr>
            </thead>

            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 px-3">
                    <div className="flex flex-col justify-center gap-1.5 h-[48px]">
                      <div className="h-2.5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                      <div className="h-2 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                    </div>
                  </td>
                  {days.map(d => (
                    <td key={d} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${isWeekend(d) ? 'bg-zinc-100/40 dark:bg-zinc-800/30' : ''}`}>
                      <div className="h-[48px]" />
                    </td>
                  ))}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100/40 dark:bg-zinc-800/30"><div className="h-[48px]" /></td>
                </tr>
              ))}

              {!loading && rows.map((r, idx) => (
                <tr
                  key={`${r.association}-${idx}`}
                  className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group"
                >
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-3 transition-colors">
                    <div className="flex flex-col justify-center h-[48px] gap-0.5">
                      <span
                        className="text-[13px] font-medium truncate text-zinc-900 dark:text-zinc-100"
                        style={{ maxWidth: 250 }}
                        title={r.association}
                      >
                        {r.association}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded bg-zinc-100 dark:bg-zinc-800">
                          <span className="opacity-70">всего</span>
                          <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{r.lifetimeTotal}</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded bg-zinc-100 dark:bg-zinc-800">
                          <span className="opacity-70">ср/день</span>
                          <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{r.lifetimeAvgPerDay.toFixed(1)}</span>
                        </span>
                      </div>
                    </div>
                  </td>
                  {days.map(d => {
                    const c = r.counts[d] ?? 0
                    return (
                      <td key={d} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${isWeekend(d) ? 'bg-zinc-100/40 dark:bg-zinc-800/30' : ''}`}>
                        {c > 0 ? (
                          <div
                            className="w-full h-[48px] flex items-center justify-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20"
                            title={`${r.association}: ${c} шт.`}
                          >
                            {c}
                          </div>
                        ) : (
                          <div className="w-full h-[48px]" />
                        )}
                      </td>
                    )
                  })}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                    <div className="h-[48px] flex items-center justify-center text-[12px] font-semibold px-2 text-zinc-900 dark:text-zinc-100">
                      {r.total}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 2} className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Нет данных за этот месяц
                  </td>
                </tr>
              )}

              {!loading && rows.length > 0 && (
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                  <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                    <div className="h-[36px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                      Итого ({rows.length} из {totalGroups})
                    </div>
                  </td>
                  {days.map(d => (
                    <td key={d} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${isWeekend(d) ? 'bg-zinc-100/60 dark:bg-zinc-800/40' : ''}`}>
                      <div className={`h-[36px] flex items-center justify-center text-[11px] font-semibold ${
                        (dayTotals[d] ?? 0) > 0
                          ? 'text-zinc-900 dark:text-zinc-100'
                          : 'text-transparent'
                      }`}>
                        {dayTotals[d] > 0 ? dayTotals[d] : '0'}
                      </div>
                    </td>
                  ))}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100 dark:bg-zinc-800/60">
                    <div className="h-[36px] flex items-center justify-center text-[12px] font-bold px-2 text-zinc-900 dark:text-zinc-100">
                      {loadedTotal}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
            <span>
              Показано {rows.length} из {totalGroups} объединений
              {grandTotal > 0 && <> · всего за месяц: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{grandTotal}</span></>}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-3 h-8 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                {loadingMore ? 'Загрузка…' : `Загрузить ещё ${PAGE_SIZE}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
