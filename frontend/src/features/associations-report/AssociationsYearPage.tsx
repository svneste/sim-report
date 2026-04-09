import { useEffect, useMemo, useState } from 'react'
import { runSync } from '../sim-calendar/api/simReport'
import {
  fetchAssociationsYearly,
  type AssociationYearlyRow,
} from './api/associationsReport'

const MONTH_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

/**
 * Годовая таблица "Заявки по объединениям":
 *   строки — объединения (из custom field 539431),
 *   колонки — 12 месяцев года,
 *   каждая ячейка — количество поступивших сделок (по deal.created_at в МСК)
 *   для данного объединения в данном месяце.
 *
 * В отличие от "Подключения по дням", этот отчёт считает именно поступившие
 * заявки, а не факт регистрации сим-карты — так проще видеть общий поток
 * по объединениям за год.
 */
export function AssociationsYearPage() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(() => today.getFullYear())

  const [rows, setRows]             = useState<AssociationYearlyRow[]>([])
  const [monthTotals, setMonthTotals] = useState<Record<number, number>>({})
  const [grandTotal, setGrandTotal] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [reloadCounter, setReloadCounter] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAssociationsYearly(year)
      .then(r => {
        if (cancelled) return
        setRows(r.rows)
        setMonthTotals(r.monthTotals)
        setGrandTotal(r.grandTotal)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, reloadCounter])

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

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const isCurrentMonth = (m: number) =>
    today.getFullYear() === year && today.getMonth() + 1 === m
  const busy = loading || syncing

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Заявки по объединениям · по месяцам</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setYear(y => y - 1)}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >‹</button>
          <div className="min-w-[80px] text-center text-sm font-semibold">
            {year}{busy && ' …'}
          </div>
          <button
            onClick={() => setYear(y => y + 1)}
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
                  style={{ width: 260, minWidth: 260, height: 48 }}
                >
                  Объединение
                </th>
                {months.map(m => (
                  <th
                    key={m}
                    className={`border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-0 text-center`}
                    style={{ width: 80, minWidth: 80 }}
                  >
                    <div className="flex flex-col items-center justify-center gap-0.5 py-1.5">
                      <span className={`text-[11px] leading-none font-semibold uppercase tracking-wide ${
                        isCurrentMonth(m)
                          ? 'text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}>{MONTH_SHORT[m - 1]}</span>
                    </div>
                  </th>
                ))}
                <th
                  className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  style={{ width: 80, minWidth: 80 }}
                >
                  Итого
                </th>
              </tr>
            </thead>

            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 px-4">
                    <div className="h-[36px] flex items-center">
                      <div className="h-2.5 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                    </div>
                  </td>
                  {months.map(m => (
                    <td key={m} className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                      <div className="h-[36px]" />
                    </td>
                  ))}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100/40 dark:bg-zinc-800/30">
                    <div className="h-[36px]" />
                  </td>
                </tr>
              ))}

              {!loading && rows.map(r => (
                <tr key={r.association} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors">
                    <div className="h-[36px] flex items-center text-[13px] text-zinc-900 dark:text-zinc-100 truncate" style={{ maxWidth: 240 }}>
                      {r.association}
                    </div>
                  </td>
                  {months.map(m => {
                    const c = r.counts[m] ?? 0
                    return (
                      <td key={m} className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                        <div className={`h-[36px] flex items-center justify-center text-[12px] font-semibold ${
                          c > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-zinc-300 dark:text-zinc-700'
                        }`}>
                          {c > 0 ? c : '—'}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                    <div className="h-[36px] flex items-center justify-center text-[12px] font-bold text-zinc-900 dark:text-zinc-100">
                      {r.total}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={months.length + 2} className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Нет данных за этот год
                  </td>
                </tr>
              )}

              {!loading && rows.length > 0 && (
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                  <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                    <div className="h-[36px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                  </td>
                  {months.map(m => {
                    const t = monthTotals[m] ?? 0
                    return (
                      <td key={m} className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                        <div className={`h-[36px] flex items-center justify-center text-[12px] font-semibold ${
                          t > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-700'
                        }`}>
                          {t > 0 ? t : '0'}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100 dark:bg-zinc-800/60">
                    <div className="h-[36px] flex items-center justify-center text-[12px] font-bold px-2 text-zinc-900 dark:text-zinc-100">
                      {grandTotal > 0 ? grandTotal : '—'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
