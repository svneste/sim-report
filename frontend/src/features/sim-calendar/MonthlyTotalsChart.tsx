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

export interface MonthlyTotalsChartProps {
  /** Дни месяца, которые должны быть на оси X (1..N) */
  days: number[]
  /** Количество оформлений по дням текущего месяца */
  current: Record<number, number>
  /** Количество оформлений по дням предыдущего месяца — для серой пунктирной линии */
  previous: Record<number, number>
  currentLabel:  string // напр. "Апрель 2026"
  previousLabel: string // напр. "Март 2026"
}

interface ChartRow {
  day:      number
  current:  number
  previous: number
}

/**
 * График динамики оформлений по дням, на recharts.
 * Можно расширять (доп. серии, brush для зума, события, drill-down)
 * без переписывания — recharts композируется через JSX.
 */
export function MonthlyTotalsChart({
  days,
  current,
  previous,
  currentLabel,
  previousLabel,
}: MonthlyTotalsChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const data: ChartRow[] = useMemo(
    () => days.map(d => ({
      day:      d,
      current:  current[d]  ?? 0,
      previous: previous[d] ?? 0,
    })),
    [days, current, previous],
  )

  // Цвета: emerald-500 / zinc-* в зависимости от темы
  const colorCurrent  = '#10b981' // emerald-500
  const colorPrevious = isDark ? '#52525b' : '#a1a1aa' // zinc-600 / zinc-400
  const colorAxis     = isDark ? '#52525b' : '#a1a1aa'
  const colorGrid     = isDark ? '#27272a' : '#e4e4e7' // zinc-800 / zinc-200
  const colorTooltip  = isDark ? '#18181b' : '#ffffff' // zinc-900 / white
  const colorTooltipBorder = isDark ? '#27272a' : '#e4e4e7'

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Динамика по дням
        </div>
        <div className="flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-[2px] bg-emerald-500 rounded-full" />
            {currentLabel}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-[2px] bg-zinc-400 dark:bg-zinc-600 rounded-full" />
            {previousLabel}
          </div>
        </div>
      </div>

      <div className="w-full" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="sim-area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={colorCurrent} stopOpacity={0.28} />
                <stop offset="100%" stopColor={colorCurrent} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={colorGrid} strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="day"
              type="number"
              domain={[1, days.length]}
              ticks={days}
              interval={0}
              tick={{ fill: colorAxis, fontSize: 10 }}
              tickLine={{ stroke: colorGrid }}
              axisLine={{ stroke: colorGrid }}
              padding={{ left: 4, right: 4 }}
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
                color:      isDark ? '#a1a1aa' : '#71717a',
                marginBottom: 4,
                fontSize:   11,
              }}
              labelFormatter={(label) => `${label} число`}
              formatter={(value, _name, item) => {
                const key = (item as { dataKey?: string })?.dataKey
                const label = key === 'current' ? currentLabel : previousLabel
                return [`${Number(value ?? 0)} шт.`, label]
              }}
            />

            <Area
              type="monotone"
              dataKey="current"
              stroke={colorCurrent}
              strokeWidth={2}
              fill="url(#sim-area-gradient)"
              dot={false}
              activeDot={{
                r: 4,
                stroke: isDark ? '#18181b' : '#ffffff',
                strokeWidth: 2,
                fill: colorCurrent,
              }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="previous"
              stroke={colorPrevious}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{
                r: 3.5,
                stroke: isDark ? '#18181b' : '#ffffff',
                strokeWidth: 2,
                fill: colorPrevious,
              }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
