import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../../shared/theme/useTheme'
import {
  fetchMegafonDynamics,
  type MegafonDynamics,
} from './api/megafon'

const MONTH_SHORT = [
  '', 'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

const MONTH_FULL = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function periodLabel(p: number) {
  const y = Math.floor(p / 100)
  const m = p % 100
  return `${MONTH_SHORT[m] ?? m}'${String(y).slice(2)}`
}

function periodFullLabel(p: number) {
  const y = Math.floor(p / 100)
  const m = p % 100
  return `${MONTH_FULL[m] ?? m} ${y}`
}

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(v)
}

const fmtRub = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' \u20BD'

// Цвета линий для договоров
const CONTRACT_COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

interface ChartRow {
  period: number
  label: string
  fullLabel: string
  total: number
  [key: string]: string | number // dynamic contract keys
}

export function MegafonDynamicsPage() {
  const [data, setData] = useState<MegafonDynamics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchMegafonDynamics()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Преобразуем данные в формат для Recharts
  const { chartRows, contractKeys } = useMemo(() => {
    if (!data) return { chartRows: [], contractKeys: [] as string[] }

    const keys = data.contracts

    // Собираем данные по периодам
    const byPeriod = new Map<number, ChartRow>()
    for (const row of data.rows) {
      let entry = byPeriod.get(row.period)
      if (!entry) {
        entry = {
          period: row.period,
          label: periodLabel(row.period),
          fullLabel: periodFullLabel(row.period),
          total: 0,
        }
        byPeriod.set(row.period, entry)
      }
      const reward = row.rewardMonth / 100 // копейки → рубли
      entry[`contract_${row.contract}`] = reward
      entry.total = (entry.total as number) + reward
    }

    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period - b.period)

    // Заполняем нулями пропущенные договоры
    for (const row of rows) {
      for (const k of keys) {
        if (row[`contract_${k}`] === undefined) row[`contract_${k}`] = 0
      }
    }

    return { chartRows: rows, contractKeys: keys }
  }, [data])

  const colorTotal = '#10b981'
  const colorAxis = isDark ? '#52525b' : '#a1a1aa'
  const colorGrid = isDark ? '#27272a' : '#e4e4e7'
  const colorTooltip = isDark ? '#18181b' : '#ffffff'
  const colorTooltipBorder = isDark ? '#27272a' : '#e4e4e7'

  const hasData = chartRows.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Финансы · МегаФон · Динамика</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4" style={{ height: 400 }}>
          <div className="h-full flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
          </div>
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* Легенда */}
          <div className="flex items-center gap-4 mb-3 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
            {contractKeys.map((k, i) => (
              <div key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-[2px] rounded-full"
                  style={{ background: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }}
                />
                {k}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorTotal }} />
              Итого
            </div>
          </div>

          {/* График */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="meg-total-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={colorTotal} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={colorTotal} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke={colorGrid} strokeDasharray="3 3" vertical={false} />

                  <XAxis
                    dataKey="label"
                    interval={0}
                    tick={{ fill: colorAxis, fontSize: 10 }}
                    tickLine={{ stroke: colorGrid }}
                    axisLine={{ stroke: colorGrid }}
                  />
                  <YAxis
                    tick={{ fill: colorAxis, fontSize: 10 }}
                    tickLine={{ stroke: colorGrid }}
                    axisLine={{ stroke: colorGrid }}
                    width={55}
                    allowDecimals={false}
                    tickFormatter={fmtK}
                  />

                  <Tooltip
                    cursor={{ stroke: colorAxis, strokeDasharray: '3 3' }}
                    contentStyle={{
                      background: colorTooltip,
                      border: `1px solid ${colorTooltipBorder}`,
                      borderRadius: 8,
                      fontSize: 12,
                      padding: '8px 10px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      color: isDark ? '#e4e4e7' : '#18181b',
                    }}
                    labelStyle={{
                      color: isDark ? '#a1a1aa' : '#71717a',
                      marginBottom: 4,
                      fontSize: 11,
                    }}
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload as ChartRow | undefined
                      return row?.fullLabel ?? _label
                    }}
                    formatter={(value, _name) => {
                      const v = Number(value ?? 0)
                      const name = String(_name)
                      let label = 'Итого'
                      if (name.startsWith('contract_')) {
                        label = name.replace('contract_', '')
                      }
                      return [fmtRub(v), label]
                    }}
                  />

                  {/* Линии по договорам */}
                  {contractKeys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={`contract_${k}`}
                      stroke={CONTRACT_COLORS[i % CONTRACT_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CONTRACT_COLORS[i % CONTRACT_COLORS.length], stroke: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }}
                      activeDot={{ r: 5, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }}
                      isAnimationActive={false}
                    />
                  ))}

                  {/* Итого — зелёная с заливкой */}
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={colorTotal}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    fill="url(#meg-total-grad)"
                    dot={{ r: 3, fill: colorTotal, stroke: colorTotal }}
                    activeDot={{ r: 5, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: colorTotal }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Таблица с данными */}
          <div className="mt-6 mb-6">
            <h2 className="text-base font-semibold mb-3">Детализация по месяцам</h2>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
              <div className="overflow-x-auto">
                <table className="border-collapse w-full">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10">
                        Период
                      </th>
                      {contractKeys.map((k, i) => (
                        <th key={k} className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium h-10 whitespace-nowrap" style={{ color: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }}>
                          {k}
                        </th>
                      ))}
                      <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-emerald-600 dark:text-emerald-400 h-10">
                        Итого
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartRows.map(row => (
                      <tr key={row.period} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors">
                          <div className="h-[36px] flex items-center text-[13px] text-zinc-900 dark:text-zinc-100">
                            {row.fullLabel}
                          </div>
                        </td>
                        {contractKeys.map(k => (
                          <td key={k} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                            <div className="h-[36px] flex items-center justify-end text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                              {fmtRub(Number(row[`contract_${k}`] ?? 0))}
                            </div>
                          </td>
                        ))}
                        <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                          <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                            {fmtRub(row.total as number)}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {/* Итого */}
                    <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                      <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                        <div className="h-[36px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                      </td>
                      {contractKeys.map(k => {
                        const sum = chartRows.reduce((s, r) => s + Number(r[`contract_${k}`] ?? 0), 0)
                        return (
                          <td key={k} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                            <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-zinc-900 dark:text-zinc-100">
                              {fmtRub(sum)}
                            </div>
                          </td>
                        )
                      })}
                      <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                        <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                          {fmtRub(chartRows.reduce((s, r) => s + (r.total as number), 0))}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && !hasData && !error && (
        <div className="text-center py-16 text-sm text-zinc-500 dark:text-zinc-400">
          Нет данных. Загрузите xlsx-отчёты МегаФон за несколько периодов.
        </div>
      )}
    </div>
  )
}
