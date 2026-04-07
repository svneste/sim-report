import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../../shared/theme/useTheme'
import { MONTH_NAMES_NOM } from '../../shared/lib/date'
import { fetchLeadsReport, type LeadsReportPayload } from './api/leadsReport'
import { runSync } from '../sim-calendar/api/simReport'

interface KpiCardProps {
  title:    string
  value:    number | string
  hint?:    string
  accent?:  'default' | 'positive' | 'warning' | 'danger'
}

function KpiCard({ title, value, hint, accent = 'default' }: KpiCardProps) {
  const accentClass = {
    default:  'text-zinc-900 dark:text-zinc-100',
    positive: 'text-emerald-600 dark:text-emerald-400',
    warning:  'text-amber-600 dark:text-amber-400',
    danger:   'text-red-600 dark:text-red-400',
  }[accent]

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
        {title}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${accentClass}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">{hint}</div>
      )}
    </div>
  )
}

function pct(numer: number, denom: number): string {
  if (denom <= 0) return '—'
  return `${Math.round((numer / denom) * 100)}%`
}

export function LeadsReportPage() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const year   = view.getFullYear()
  const month0 = view.getMonth()
  const month1 = month0 + 1

  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [data,    setData]    = useState<LeadsReportPayload | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [reloadCounter, setReloadCounter] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchLeadsReport(year, month1)
      .then(r => { if (!cancelled) setData(r) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month1, reloadCounter])

  function prev() { setView(new Date(year, month0 - 1, 1)) }
  function next() { setView(new Date(year, month0 + 1, 1)) }

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

  const monthLabel = `${MONTH_NAMES_NOM[month0]} ${year}`
  const busy = loading || syncing

  const colorAxis    = isDark ? '#52525b' : '#a1a1aa'
  const colorGrid    = isDark ? '#27272a' : '#e4e4e7'
  const colorTooltip = isDark ? '#18181b' : '#ffffff'
  const colorTooltipBorder = isDark ? '#27272a' : '#e4e4e7'
  // Палитра для столбцов причин — мягкие, но различимые
  const reasonColors = [
    '#ef4444', '#f97316', '#eab308', '#84cc16',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  ]

  const lostChartData = (data?.lostByReason ?? []).map((r, i) => ({
    name:  r.reasonName,
    count: r.count,
    color: reasonColors[i % reasonColors.length],
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">Отчёт по заявкам</h1>
        <div className="flex items-center gap-2">
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

      {loading && !data && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Загрузка…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Всего заявок"
              value={data.total}
              hint={`Поступило в ${monthLabel.toLowerCase()}`}
            />
            <KpiCard
              title={`Дальше "${data.newStageName}"`}
              value={data.advancedPastNew}
              hint={`${pct(data.advancedPastNew, data.total)} от всех заявок`}
              accent="positive"
            />
            <KpiCard
              title="Не реализовано"
              value={data.lostTotal}
              hint={`${pct(data.lostTotal, data.total)} от всех заявок`}
              accent="danger"
            />
            <KpiCard
              title="В работе / прочее"
              value={Math.max(data.total - data.advancedPastNew - data.lostTotal, 0)}
              hint="Ещё на первой стадии или другие статусы"
              accent="warning"
            />
          </div>

          <div className="mt-5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Причины «не реализовано»
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Всего: {data.lostTotal}
              </div>
            </div>

            {lostChartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                Нет закрытых заявок за этот месяц
              </div>
            ) : (
              <>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={lostChartData}
                      margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid stroke={colorGrid} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: colorAxis, fontSize: 10 }}
                        tickLine={{ stroke: colorGrid }}
                        axisLine={{ stroke: colorGrid }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        tick={{ fill: colorAxis, fontSize: 10 }}
                        tickLine={{ stroke: colorGrid }}
                        axisLine={{ stroke: colorGrid }}
                        width={40}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                        contentStyle={{
                          background:    colorTooltip,
                          border:        `1px solid ${colorTooltipBorder}`,
                          borderRadius:  8,
                          fontSize:      12,
                          padding:       '8px 10px',
                          boxShadow:     '0 4px 12px rgba(0,0,0,0.12)',
                          color:         isDark ? '#e4e4e7' : '#18181b',
                        }}
                        formatter={(value) => [`${Number(value ?? 0)} шт.`, 'Заявок']}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {lostChartData.map((row, i) => (
                          <Cell key={i} fill={row.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                  <table className="w-full text-sm">
                    <tbody>
                      {data.lostByReason.map((r, i) => (
                        <tr
                          key={`${r.reasonId ?? 'none'}-${i}`}
                          className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0"
                        >
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ background: reasonColors[i % reasonColors.length] }}
                              />
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {r.reasonName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100 font-medium">
                            {r.count}
                          </td>
                          <td className="py-2 pl-4 text-right tabular-nums text-[12px] text-zinc-500 dark:text-zinc-400 w-16">
                            {pct(r.count, data.lostTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
