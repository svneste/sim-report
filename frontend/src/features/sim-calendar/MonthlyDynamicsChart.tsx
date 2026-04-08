import { useEffect, useMemo, useState } from 'react'
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
import { fetchMonthlyDynamics, type MonthlyPoint, type NumberType } from './api/simReport'
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
  incoming:  number
  qualified: number
  activated: number
}

export interface MonthlyDynamicsChartProps {
  /** Сколько месяцев показывать. По умолчанию 12. */
  months?: number
  /** Триггер на повторную загрузку (увеличиваем при кнопке "Обновить") */
  reloadKey?: number
}

const NUMBER_TYPE_OPTIONS: { value: NumberType; label: string }[] = [
  { value: 'all', label: 'Все'   },
  { value: 'mnp', label: 'MNP'   },
  { value: 'new', label: 'Новые' },
]

/**
 * График динамики по месяцам в виде воронки. Показывает три линии:
 * "Поступило" → "Квал. клиенты" → "Включено", чтобы видеть, какая
 * доля заявок реально доходит до включения номера.
 *
 * Сегментированный контрол сверху фильтрует по типу номера: Все / MNP /
 * Новые. Тип определяется по custom-полю 539425 в карточке сделки —
 * галочка стоит = MNP, нет = новый номер.
 */
export function MonthlyDynamicsChart({ months = 12, reloadKey = 0 }: MonthlyDynamicsChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [numberType, setNumberType] = useState<NumberType>('all')
  const [points, setPoints]   = useState<MonthlyPoint[] | null>(null)
  const [error,  setError]    = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMonthlyDynamics(months, numberType)
      .then(r => { if (!cancelled) setPoints(r.points) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [months, reloadKey, numberType])

  const data: ChartRow[] = useMemo(() => {
    if (!points) return []
    return points.map(p => ({
      label:     `${MONTH_NAMES_SHORT[p.month - 1]}'${String(p.year).slice(2)}`,
      fullLabel: `${MONTH_NAMES_NOM[p.month - 1]} ${p.year}`,
      incoming:  p.incoming,
      qualified: p.qualified,
      activated: p.activated,
    }))
  }, [points])

  const colorIncoming   = isDark ? '#71717a' : '#a1a1aa' // zinc — total/baseline
  const colorQualified  = '#3b82f6' // blue — quality leads
  const colorActivated  = '#10b981' // emerald — activated
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
        <div className="flex items-center gap-3">
          {/* Сегментированный контрол MNP / Новые / Все */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {NUMBER_TYPE_OPTIONS.map(opt => {
              const active = numberType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNumberType(opt.value)}
                  className={`px-2.5 h-6 rounded-md text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Последние {months} мес.
          </div>
        </div>
      </div>

      {/* Лёгкая легенда — три цветных метки */}
      <div className="flex items-center gap-4 mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorIncoming }} />
          Поступило
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorQualified }} />
          Квал. клиенты
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: colorActivated }} />
          Включено
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
                <linearGradient id="md-activated-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={colorActivated} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colorActivated} stopOpacity={0} />
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
                formatter={(value, _name, item) => {
                  const key = (item as { dataKey?: string })?.dataKey
                  const v = Number(value ?? 0)
                  const row = (item as { payload?: ChartRow })?.payload
                  const base = row?.incoming ?? 0
                  let label = 'Поступило'
                  let suffix = ''
                  if (key === 'qualified') {
                    label = 'Квал. клиенты'
                    if (base > 0) suffix = ` · ${Math.round((v / base) * 100)}%`
                  } else if (key === 'activated') {
                    label = 'Включено'
                    if (base > 0) suffix = ` · ${Math.round((v / base) * 100)}%`
                  }
                  return [`${v} шт.${suffix}`, label]
                }}
              />

              {/* Поступило — серая базовая линия */}
              <Line
                type="monotone"
                dataKey="incoming"
                stroke={colorIncoming}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: colorIncoming }}
                isAnimationActive={false}
              />
              {/* Квал клиенты — синяя сплошная */}
              <Line
                type="monotone"
                dataKey="qualified"
                stroke={colorQualified}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: isDark ? '#18181b' : '#fff', strokeWidth: 2, fill: colorQualified }}
                isAnimationActive={false}
              />
              {/* Включено — зелёная заливка как раньше */}
              <Area
                type="monotone"
                dataKey="activated"
                stroke={colorActivated}
                strokeWidth={2}
                fill="url(#md-activated-gradient)"
                dot={{ r: 3, fill: colorActivated, stroke: colorActivated }}
                activeDot={{
                  r: 5,
                  stroke: isDark ? '#18181b' : '#ffffff',
                  strokeWidth: 2,
                  fill: colorActivated,
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
