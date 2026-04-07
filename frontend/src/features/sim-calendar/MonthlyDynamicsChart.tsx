import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../../shared/theme/useTheme'
import { fetchMonthlyDynamics, type MonthlyPoint } from './api/simReport'
import { MONTH_NAMES_NOM } from '../../shared/lib/date'

const MONTH_NAMES_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

interface ChartRow {
  /** Метка для оси X — "апр'26" */
  label: string
  /** Полное "Апрель 2026" — для тултипа */
  fullLabel: string
  count: number
}

export interface MonthlyDynamicsChartProps {
  /** Сколько месяцев показывать. По умолчанию 12. */
  months?: number
  /** Триггер на повторную загрузку (увеличиваем при кнопке "Обновить") */
  reloadKey?: number
}

/**
 * График динамики оформлений по месяцам — последние N месяцев,
 * независим от того, какой месяц открыт в календаре.
 */
export function MonthlyDynamicsChart({ months = 12, reloadKey = 0 }: MonthlyDynamicsChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [points, setPoints]   = useState<MonthlyPoint[] | null>(null)
  const [error,  setError]    = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMonthlyDynamics(months)
      .then(r => { if (!cancelled) setPoints(r.points) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [months, reloadKey])

  const data: ChartRow[] = useMemo(() => {
    if (!points) return []
    return points.map(p => ({
      label:     `${MONTH_NAMES_SHORT[p.month - 1]}'${String(p.year).slice(2)}`,
      fullLabel: `${MONTH_NAMES_NOM[p.month - 1]} ${p.year}`,
      count:     p.count,
    }))
  }, [points])

  const colorCurrent  = '#10b981'
  const colorAxis     = isDark ? '#52525b' : '#a1a1aa'
  const colorGrid     = isDark ? '#27272a' : '#e4e4e7'
  const colorTooltip  = isDark ? '#18181b' : '#ffffff'
  const colorTooltipBorder = isDark ? '#27272a' : '#e4e4e7'

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Динамика по месяцам
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Последние {months} мес.
        </div>
      </div>

      <div className="w-full" style={{ height: 280 }}>
        {loading && (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            Загрузка…
          </div>
        )}
        {error && !loading && (
          <div className="h-full flex items-center justify-center text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="sim-monthly-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={colorCurrent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colorCurrent} stopOpacity={0} />
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
                width={40}
                allowDecimals={false}
              />

              <Tooltip
                cursor={{ stroke: colorAxis, strokeDasharray: '3 3' }}
                contentStyle={{
                  background:    colorTooltip,
                  border:        `1px solid ${colorTooltipBorder}`,
                  borderRadius:  8,
                  fontSize:      12,
                  padding:       '8px 10px',
                  boxShadow:     '0 4px 12px rgba(0,0,0,0.12)',
                  color:         isDark ? '#e4e4e7' : '#18181b',
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
                formatter={(value) => [`${Number(value ?? 0)} шт.`, 'Оформлений']}
              />

              <Area
                type="monotone"
                dataKey="count"
                stroke={colorCurrent}
                strokeWidth={2}
                fill="url(#sim-monthly-gradient)"
                dot={{ r: 3, fill: colorCurrent, stroke: colorCurrent }}
                activeDot={{
                  r: 5,
                  stroke: isDark ? '#18181b' : '#ffffff',
                  strokeWidth: 2,
                  fill: colorCurrent,
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
