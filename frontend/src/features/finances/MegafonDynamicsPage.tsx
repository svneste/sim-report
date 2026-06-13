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

// Сдвиг периода YYYYMM на delta месяцев
function addMonths(period: number, delta: number): number {
  const y = Math.floor(period / 100)
  const m = period % 100
  const idx = y * 12 + (m - 1) + delta
  return Math.floor(idx / 12) * 100 + (idx % 12) + 1
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
  total: number | null
  [key: string]: string | number | null // dynamic contract keys (null = месяц без данных)
}

export function MegafonDynamicsPage() {
  const [data, setData] = useState<MegafonDynamics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  // Скрытые серии (клик по легенде)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // Сортировка таблицы: 'desc' — сначала новые, 'asc' — сначала старые
  const [tableSort, setTableSort] = useState<'asc' | 'desc'>('asc')
  // Выбранный год графика (null до загрузки данных — затем последний год с данными)
  const [year, setYear] = useState<number | null>(null)
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

  // Агрегаты по периодам + список годов, за которые есть данные.
  const { byPeriod, contractKeys, years } = useMemo(() => {
    const empty = {
      byPeriod: new Map<number, { total: number; contracts: Record<string, number> }>(),
      contractKeys: [] as MegafonDynamics['contracts'],
      years: [] as number[],
    }
    if (!data) return empty

    const keys = data.contracts
    const byPeriod = new Map<number, { total: number; contracts: Record<string, number> }>()
    for (const row of data.rows) {
      let e = byPeriod.get(row.period)
      if (!e) { e = { total: 0, contracts: {} }; byPeriod.set(row.period, e) }
      const reward = row.rewardMonth / 100 // копейки → рубли
      e.contracts[row.key] = (e.contracts[row.key] ?? 0) + reward
      e.total += reward
    }

    const years = Array.from(new Set(Array.from(byPeriod.keys()).map(p => Math.floor(p / 100))))
      .sort((a, b) => a - b)

    return { byPeriod, contractKeys: keys, years }
  }, [data])

  // По умолчанию — последний год с данными (можно листать стрелками к прошлым).
  useEffect(() => {
    if (year == null && years.length) setYear(years[years.length - 1])
  }, [years, year])

  // Строки графика — весь выбранный год, январь→декабрь (пустые месяцы — null,
  // чтобы линия рвалась, а не падала в ноль; ось показывает весь год-«каркас»).
  const chartRows = useMemo(() => {
    if (year == null) return [] as ChartRow[]
    const start = year * 100 + 1
    const end = year * 100 + 12

    const rows: ChartRow[] = []
    for (let p = start; p <= end; p = addMonths(p, 1)) {
      const e = byPeriod.get(p)
      const row: ChartRow = {
        period: p,
        label: periodLabel(p),
        fullLabel: periodFullLabel(p),
        total: e ? e.total : null,
      }
      for (const k of contractKeys) {
        row[`contract_${k.key}`] = e ? (e.contracts[k.key] ?? 0) : null
      }
      rows.push(row)
    }
    return rows
  }, [byPeriod, contractKeys, year])

  const colorTotal = COLOR_TOTAL
  const colorAxis = isDark ? '#71717a' : '#a1a1aa'
  const colorGrid = isDark ? '#27272a' : '#f0f0f1'

  const hasData = (data?.rows.length ?? 0) > 0

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

  // Для таблицы — только месяцы с данными (без пустого «каркаса» графика).
  // Базовый порядок — хронологический; направление задаёт tableSort.
  const tableRows = useMemo(() => {
    const rows = chartRows.filter(r => r.total != null)
    return tableSort === 'desc' ? [...rows].reverse() : rows
  }, [chartRows, tableSort])

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Финансы · МегаФон · Динамика</h1>
        {year != null && years.length > 0 && (
          <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-sm">
            <button
              onClick={() => setYear(y => (y != null ? y - 1 : y))}
              disabled={year <= years[0]}
              title="Предыдущий год"
              className="px-2.5 h-8 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              ‹
            </button>
            <span className="px-3 h-8 flex items-center font-medium tabular-nums border-x border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
              {year}
            </span>
            <button
              onClick={() => setYear(y => (y != null ? y + 1 : y))}
              disabled={year >= years[years.length - 1]}
              title="Следующий год"
              className="px-2.5 h-8 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              ›
            </button>
          </div>
        )}
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
            {/* Минималистичная легенда сверху (клик — скрыть/показать серию) */}
            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-5 pt-4 pb-1">
              {series.map(s => {
                const off = hidden.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSeries(s.id)}
                    title={off ? 'Показать' : 'Скрыть'}
                    className={`flex items-center gap-2 text-[12px] transition-opacity ${
                      off ? 'opacity-40 text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {/* Маркер-линия: пунктир для «Итого», сплошная для договоров */}
                    {s.hero ? (
                      <span className="inline-block w-4 border-t-[2px] border-dashed" style={{ borderColor: s.color }} />
                    ) : (
                      <span className="inline-block w-4 h-[2px] rounded-full" style={{ background: s.color }} />
                    )}
                    <span className={off ? 'line-through' : ''}>{s.label}</span>
                  </button>
                )
              })}
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
                    minTickGap={0}
                    padding={{ left: 12, right: 12 }}
                    tick={{ fill: colorAxis, fontSize: 10 }}
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

                  {/* Итого — огибающая: пунктирная зелёная с мягкой заливкой (рисуем первой, под линиями) */}
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Итого"
                    hide={hidden.has('total')}
                    connectNulls={false}
                    stroke={colorTotal}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    fill="url(#meg-total-grad)"
                    dot={false}
                    activeDot={{ r: 5, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2, fill: colorTotal }}
                    isAnimationActive={false}
                  />

                  {/* Линии по договорам — сплошные, с аккуратными точками на узлах */}
                  {contractKeys.map((k, i) => (
                    <Line
                      key={k.key}
                      name={k.label}
                      type="monotone"
                      dataKey={`contract_${k.key}`}
                      hide={hidden.has(`contract_${k.key}`)}
                      connectNulls={false}
                      stroke={CONTRACT_COLORS[i % CONTRACT_COLORS.length]}
                      strokeWidth={2}
                      strokeLinecap="round"
                      dot={{ r: 2.5, fill: CONTRACT_COLORS[i % CONTRACT_COLORS.length], strokeWidth: 0 }}
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
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 className="text-base font-semibold">Детализация по месяцам</h2>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-xs">
                <button
                  onClick={() => setTableSort('asc')}
                  className={`px-3 h-8 transition-colors ${
                    tableSort === 'asc'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  Сначала старые
                </button>
                <button
                  onClick={() => setTableSort('desc')}
                  className={`px-3 h-8 border-l border-zinc-200 dark:border-zinc-800 transition-colors ${
                    tableSort === 'desc'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  Сначала новые
                </button>
              </div>
            </div>
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
                    {tableRows.map(row => (
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
                        const sum = tableRows.reduce((s, r) => s + Number(r[`contract_${k.key}`] ?? 0), 0)
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
                          {fmtRub(tableRows.reduce((s, r) => s + Number(r.total ?? 0), 0))}
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

  // Только видимые серии с непустым значением, герой (Итого) — первым
  const visible = new Set(payload.map(p => String(p.dataKey)))
  const items = series
    .filter(s => visible.has(s.id) && row[s.id] != null)
    .sort((a, b) => Number(b.hero) - Number(a.hero))

  if (items.length === 0) return null

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
