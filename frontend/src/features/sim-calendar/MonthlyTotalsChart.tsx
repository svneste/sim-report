import { useMemo, useState } from 'react'
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
import type { SimReportEntry, SimReportUser } from './api/simReport'

export interface MonthlyTotalsChartProps {
  /** Заголовок над графиком */
  title:        string
  /** Дни месяца, которые должны быть на оси X (1..N) */
  days: number[]
  users:        SimReportUser[]
  entries:      SimReportEntry[]
  prevEntries:  SimReportEntry[]
  currentLabel: string
  previousLabel: string
}

interface ChartRow {
  day:      number
  current:  number
  previous: number
}

function getInitials(name: string): string {
  const p = name.trim().split(' ')
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()
}

/**
 * Суммирует entries в формат { day: count }, опционально фильтруя по списку userId.
 * Если selected пустое — берём всех (без фильтра).
 */
function sumByDay(entries: SimReportEntry[], selected: Set<number>): Record<number, number> {
  const out: Record<number, number> = {}
  const filterOn = selected.size > 0
  for (const e of entries) {
    if (filterOn && !selected.has(e.userId)) continue
    const day = Number(e.date.slice(8, 10))
    out[day] = (out[day] ?? 0) + e.count
  }
  return out
}

/**
 * График динамики оформлений по дням, на recharts.
 * Под графиком — мульти-выбор сотрудников: клик по чипу включает/выключает
 * пользователя, цифры в графике пересчитываются. Прошлый месяц фильтруется
 * тем же набором юзеров.
 */
export function MonthlyTotalsChart({
  title,
  days,
  users,
  entries,
  prevEntries,
  currentLabel,
  previousLabel,
}: MonthlyTotalsChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  function toggleUser(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function clearAll() { setSelected(new Set()) }

  const isAll = selected.size === 0

  // Сумма по всему месяцу для каждого юзера — для бейджа на чипе и сортировки
  const userMonthTotals = useMemo(() => {
    const t: Record<number, number> = {}
    for (const e of entries) t[e.userId] = (t[e.userId] ?? 0) + e.count
    return t
  }, [entries])

  // Юзеры в чипах сортируем по убыванию вклада в текущий месяц
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (userMonthTotals[b.id] ?? 0) - (userMonthTotals[a.id] ?? 0))
  }, [users, userMonthTotals])

  const data: ChartRow[] = useMemo(() => {
    const cur  = sumByDay(entries, selected)
    const prev = sumByDay(prevEntries, selected)
    return days.map(d => ({
      day:      d,
      current:  cur[d]  ?? 0,
      previous: prev[d] ?? 0,
    }))
  }, [days, entries, prevEntries, selected])

  // Цвета: emerald-500 / zinc-* в зависимости от темы
  const colorCurrent  = '#10b981'
  const colorPrevious = isDark ? '#52525b' : '#a1a1aa'
  const colorAxis     = isDark ? '#52525b' : '#a1a1aa'
  const colorGrid     = isDark ? '#27272a' : '#e4e4e7'
  const colorTooltip  = isDark ? '#18181b' : '#ffffff'
  const colorTooltipBorder = isDark ? '#27272a' : '#e4e4e7'

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
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

      {/* Чипы с быстрым фильтром по сотрудникам */}
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-semibold">
            Сотрудники
          </div>
          {!isAll && (
            <button
              onClick={clearAll}
              className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Сбросить
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={clearAll}
            className={`px-2.5 h-7 rounded-full text-[11px] font-medium border transition-colors ${
              isAll
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            Все
          </button>
          {sortedUsers.map(u => {
            const active = selected.has(u.id)
            const total  = userMonthTotals[u.id] ?? 0
            return (
              <button
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className={`pl-1 pr-2.5 h-7 rounded-full text-[11px] font-medium border flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
                title={`${u.name}: ${total} шт. в текущем месяце`}
              >
                {u.avatar
                  ? <img src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  : (
                    <span className={`w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                    }`}>
                      {getInitials(u.name)}
                    </span>
                  )}
                <span className="truncate max-w-[120px]">{u.name}</span>
                <span className={`tabular-nums ${active ? 'text-white/80' : 'text-zinc-400 dark:text-zinc-500'}`}>
                  {total}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
