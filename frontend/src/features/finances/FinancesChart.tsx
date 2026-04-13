import { useMemo } from 'react'
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
import type { FinancesData } from './api/payments'

const MONTH_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

const MONTH_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(v)
}

const fmtFull = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })

interface ChartRow {
  label:     string
  fullLabel: string
  income:    number
  expense:   number
  profit:    number
}

export function FinancesChart({ data }: { data: FinancesData }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const rows: ChartRow[] = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const income  = data.incomeTotal[m]  ?? 0
      const expense = data.expenseTotal[m] ?? 0
      return {
        label:     `${MONTH_SHORT[i]}'${String(data.year).slice(2)}`,
        fullLabel: `${MONTH_FULL[i]} ${data.year}`,
        income,
        expense,
        profit: income - expense,
      }
    })
  }, [data])

  const colorIncome  = '#10b981' // emerald
  const colorExpense = '#ef4444' // red
  const colorProfit  = '#3b82f6' // blue
  const colorAxis    = isDark ? '#52525b' : '#a1a1aa'
  const colorGrid    = isDark ? '#27272a' : '#e4e4e7'
  const colorTooltip = isDark ? '#18181b' : '#ffffff'
  const colorTooltipBorder = isDark ? '#27272a' : '#e4e4e7'

  const hasData = rows.some(r => r.income > 0 || r.expense > 0)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Динамика по месяцам</h2>
      </div>

      <div className="flex items-center gap-4 mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorIncome }} />
          Выручка
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorExpense }} />
          Затраты
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorProfit }} />
          Прибыль
        </div>
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4">
        <div style={{ height: 280 }}>
          {!hasData && (
            <div className="h-full flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              Нет данных за {data.year}
            </div>
          )}
          {hasData && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="fin-profit-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={colorProfit} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={colorProfit} stopOpacity={0} />
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
                  width={50}
                  allowDecimals={false}
                  tickFormatter={fmtK}
                />

                <Tooltip
                  cursor={{ stroke: colorAxis, strokeDasharray: '3 3' }}
                  contentStyle={{
                    background:   colorTooltip,
                    border:       `1px solid ${colorTooltipBorder}`,
                    borderRadius: 8,
                    fontSize:     12,
                    padding:      '8px 10px',
                    boxShadow:    '0 4px 12px rgba(0,0,0,0.12)',
                    color:        isDark ? '#e4e4e7' : '#18181b',
                  }}
                  labelStyle={{
                    color:        isDark ? '#a1a1aa' : '#71717a',
                    marginBottom: 4,
                    fontSize:     11,
                  }}
                  labelFormatter={(_label, payload) => {
                    const row = payload?.[0]?.payload as ChartRow | undefined
                    return row?.fullLabel ?? _label
                  }}
                  itemSorter={(item) => {
                    const order: Record<string, number> = { income: 0, expense: 1, profit: 2 }
                    return order[String(item.dataKey ?? '')] ?? 99
                  }}
                  formatter={(value, _name, item) => {
                    const key = (item as { dataKey?: string })?.dataKey
                    const v = Number(value ?? 0)
                    const labels: Record<string, string> = {
                      income: 'Выручка', expense: 'Затраты', profit: 'Прибыль',
                    }
                    return [`${fmtFull(v)} \u20BD`, labels[key ?? ''] ?? '']
                  }}
                />

                {/* Выручка — зелёная */}
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke={colorIncome}
                  strokeWidth={2}
                  dot={{ r: 3, fill: colorIncome, stroke: colorIncome }}
                  activeDot={{ r: 5, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: colorIncome }}
                  isAnimationActive={false}
                />
                {/* Затраты — красная пунктирная */}
                <Line
                  type="monotone"
                  dataKey="expense"
                  stroke={colorExpense}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: colorExpense }}
                  isAnimationActive={false}
                />
                {/* Прибыль — синяя с заливкой */}
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke={colorProfit}
                  strokeWidth={2}
                  fill="url(#fin-profit-grad)"
                  dot={{ r: 3, fill: colorProfit, stroke: colorProfit }}
                  activeDot={{ r: 5, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: colorProfit }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
