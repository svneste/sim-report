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

// Цвета линий для договоров (тёплый янтарь + холодный индиго — мягкая, неконфликтная пара)
const CONTRACT_COLORS = ['#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6']
const COLOR_TOTAL = '#10b981'

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
  // Скрытые серии (клик по легенде)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const toggleSeries = useCallback((id: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

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
    if (!data) return { chartRows: [], contractKeys: [] as MegafonDynamics['contracts'] }

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
      entry[`contract_${row.key}`] = reward
      entry.total = (entry.total as number) + reward
    }

    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period - b.period)

    // Заполняем нулями пропущенные договоры
    for (const row of rows) {
      for (const k of keys) {
        if (row[`contract_${k.key}`] === undefined) row[`contract_${k.key}`] = 0
      }
    }

    return { chartRows: rows, contractKeys: keys }
  }, [data])

  const colorTotal = COLOR_TOTAL
  const colorAxis = isDark ? '#71717a' : '#a1a1aa'
  const colorGrid = isDark ? '#27272a' : '#f0f0f1'

  const hasData = chartRows.length > 0

  // Описание всех серий (договоры + Итого) в одном массиве — для легенды и линий
  const series = useMemo(() => {
    const arr = contractKeys.map((k, i) => ({
      id: `contract_${k.key}`,
      label: k.label,
      color: CONTRACT_COLORS[i % CONTRACT_COLORS.length],
      hero: false,
    }))
    arr.push({ id: 'total', label: 'Итого', color: colorTotal, hero: true })
    return arr
  }, [contractKeys, colorTotal])

  // KPI: последнее «Итого» и рост к предыдущему месяцу
  const last = chartRows[chartRows.length - 1]
  const prev = chartRows[chartRows.length - 2]
  const latestTotal = last ? Number(last.total) : 0
  const deltaPct =
    last && prev && Number(prev.total) > 0
      ? ((Number(last.total) - Number(prev.total)) / Number(prev.total)) * 100
      : null

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
          {/* Карточка графика */}
          <div className="border border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-gradient-to-b from-white to-zinc-50/60 dark:from-zinc-900 dark:to-zinc-950/40 shadow-sm overflow-hidden">
            {/* Шапка: KPI слева + интерактивная легенда справа */}
            <div className="flex items-start justify-between gap-4 flex-wrap px-5 pt-5 pb-1">
              <div>
                <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                  Вознаграждение{last ? ` · ${(last as ChartRow).fullLabel}` : ''}
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">
                    {fmtRub(latestTotal)}
                  </span>
                  {deltaPct !== null && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[12px] font-semibold px-1.5 py-0.5 rounded-md ${
                        deltaPct >= 0
                          ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
                          : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
                      }`}
                    >
                      {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
                    </span>
                  )}
                </div>
              </div>

              {/* Легенда-чипы (клик — скрыть/показать серию) */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {series.map(s => {
                  const off = hidden.has(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSeries(s.id)}
                      className={`group flex items-center gap-1.5 pl-2 pr-2.5 h-7 rounded-full border text-[12px] font-medium transition-colors ${
                        off
                          ? 'border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60'
                      }`}
                      title={off ? 'Показать' : 'Скрыть'}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full transition-opacity"
                        style={{ background: s.color, opacity: off ? 0.25 : 1 }}
                      />
                      <span className={off ? 'line-through' : ''}>{s.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* График */}
            <div className="px-2 pb-3" style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="meg-total-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={colorTotal} stopOpacity={0.28} />
                      <stop offset="55%"  stopColor={colorTotal} stopOpacity={0.07} />
                      <stop offset="100%" stopColor={colorTotal} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke={colorGrid} strokeDasharray="4 5" vertical={false} />

                  <XAxis
                    dataKey="label"
                    interval={0}
                    padding={{ left: 18, right: 18 }}
                    tick={{ fill: colorAxis, fontSize: 11 }}
                    tickMargin={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: colorAxis, fontSize: 11 }}
                    tickMargin={8}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    allowDecimals={false}
                    tickFormatter={fmtK}
                  />

                  <Tooltip
                    cursor={{ stroke: colorAxis, strokeWidth: 1, strokeDasharray: '4 4' }}
                    content={<ChartTooltip isDark={isDark} series={series} />}
                  />

                  {/* Итого — герой: сплошная зелёная с насыщенной заливкой (рисуем первой, под линиями) */}
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Итого"
                    hide={hidden.has('total')}
                    stroke={colorTotal}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    fill="url(#meg-total-grad)"
                    dot={false}
                    activeDot={{ r: 5, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2, fill: colorTotal }}
                    isAnimationActive={false}
                  />

                  {/* Линии по договорам — тонкие, без статичных точек */}
                  {contractKeys.map((k, i) => (
                    <Line
                      key={k.key}
                      name={k.label}
                      type="monotone"
                      dataKey={`contract_${k.key}`}
                      hide={hidden.has(`contract_${k.key}`)}
                      stroke={CONTRACT_COLORS[i % CONTRACT_COLORS.length]}
                      strokeWidth={2}
                      strokeLinecap="round"
                      dot={false}
                      activeDot={{ r: 4.5, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2, fill: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }}
                      isAnimationActive={false}
                    />
                  ))}
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
                        <th key={k.key} className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium h-10 whitespace-nowrap" style={{ color: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }}>
                          {k.label}
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
                          <td key={k.key} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                            <div className="h-[36px] flex items-center justify-end text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                              {fmtRub(Number(row[`contract_${k.key}`] ?? 0))}
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
                        const sum = chartRows.reduce((s, r) => s + Number(r[`contract_${k.key}`] ?? 0), 0)
                        return (
                          <td key={k.key} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
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

// ===================== Кастомный тултип =====================

interface TooltipSeries { id: string; label: string; color: string; hero: boolean }

function ChartTooltip({
  active,
  payload,
  isDark,
  series,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; payload?: ChartRow }>
  isDark: boolean
  series: TooltipSeries[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null

  // Только видимые серии, герой (Итого) — первым
  const visible = new Set(payload.map(p => String(p.dataKey)))
  const items = series
    .filter(s => visible.has(s.id))
    .sort((a, b) => Number(b.hero) - Number(a.hero))

  return (
    <div
      style={{
        background: isDark ? 'rgba(24,24,27,0.96)' : 'rgba(255,255,255,0.98)',
        border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
        borderRadius: 12,
        padding: '10px 12px',
        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.10)',
        backdropFilter: 'blur(6px)',
        minWidth: 180,
      }}
    >
      <div
        style={{ color: isDark ? '#a1a1aa' : '#71717a', fontSize: 11, fontWeight: 600, marginBottom: 8 }}
      >
        {row.fullLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
            <span style={{ color: isDark ? '#d4d4d8' : '#52525b', fontSize: 12, flex: 1 }}>
              {s.label}
            </span>
            <span
              style={{
                color: isDark ? '#fafafa' : '#18181b',
                fontSize: 12.5,
                fontWeight: s.hero ? 700 : 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtRub(Number(row[s.id] ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
