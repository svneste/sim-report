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

// Текущий период YYYYMM по локальной дате
function currentPeriod(): number {
  const d = new Date()
  return d.getFullYear() * 100 + (d.getMonth() + 1)
}

// Режим окна графика: скользящие 12 месяцев или конкретный календарный год
type ViewMode = 'rolling' | number

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(v)
}

const fmtRub = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' \u20BD'

// \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0441\u043E \u0437\u043D\u0430\u043A\u043E\u043C: \u00AB+12 345 \u20BD\u00BB / \u00AB\u221212 345 \u20BD\u00BB
const fmtSignedRub = (v: number) =>
  `${v >= 0 ? '+' : '\u2212'}${Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} \u20BD`

// \u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u0441\u043E \u0437\u043D\u0430\u043A\u043E\u043C: \u00AB+12,3%\u00BB / \u00AB\u221212,3%\u00BB
const fmtSignedPct = (v: number) =>
  `${v >= 0 ? '+' : '\u2212'}${Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`

// \u0426\u0432\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F: \u0440\u043E\u0441\u0442 \u2014 \u0437\u0435\u043B\u0451\u043D\u044B\u0439, \u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u2014 \u043A\u0440\u0430\u0441\u043D\u044B\u0439, \u043D\u043E\u043B\u044C \u2014 \u0441\u0435\u0440\u044B\u0439
const deltaColor = (v: number) =>
  v > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : v < 0
      ? 'text-red-500 dark:text-red-400'
      : 'text-zinc-400 dark:text-zinc-500'

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

// Изменение значения ячейки: ₽ (абсолютное) и % к базе
interface Delta {
  abs: number | null
  pct: number | null
}

/** Ячейка таблицы: значение + изменение (₽ и %) под ним. */
function ValueDeltaCell({ value, delta, hero, strong }: {
  value: number
  delta?: Delta
  hero?: boolean    // «Итого» — зелёный жирный
  strong?: boolean  // строка «Итого» снизу — жирный, обычный цвет
}) {
  const valueCls = hero
    ? 'font-bold text-emerald-600 dark:text-emerald-400'
    : strong
      ? 'font-bold text-zinc-900 dark:text-zinc-100'
      : 'font-semibold text-zinc-700 dark:text-zinc-300'

  return (
    <div className="min-h-[44px] py-1.5 flex flex-col items-end justify-center gap-0.5">
      <span className={`text-[12px] leading-tight ${valueCls}`}>{fmtRub(value)}</span>
      {!delta || delta.abs == null ? (
        <span className="text-[10px] leading-tight text-zinc-300 dark:text-zinc-600">—</span>
      ) : (
        <span className={`text-[10.5px] leading-tight whitespace-nowrap ${deltaColor(delta.abs)}`}>
          {fmtSignedRub(delta.abs)}
          {delta.pct != null && <span className="opacity-70">{' '}{fmtSignedPct(delta.pct)}</span>}
        </span>
      )}
    </div>
  )
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
  // Окно графика: 'rolling' — скользящие 12 мес (по умолчанию), либо год (число)
  const [view, setView] = useState<ViewMode>('rolling')
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

  // Строки графика. 'rolling' — скользящее окно 12 мес, заканчивается на текущем
  // месяце (или последнем с данными, если он позже). Год — январь→декабрь.
  // Пустые месяцы — null, чтобы линия рвалась, а не падала в ноль (ось при этом
  // показывает весь период-«каркас»).
  const chartRows = useMemo(() => {
    let start: number
    let end: number
    if (view === 'rolling') {
      const withData = Array.from(byPeriod.keys())
      const latest = withData.length ? Math.max(...withData) : currentPeriod()
      end = Math.max(currentPeriod(), latest)
      start = addMonths(end, -11)
    } else {
      start = view * 100 + 1
      end = view * 100 + 12
    }

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
  }, [byPeriod, contractKeys, view])

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
  // Для каждой ячейки (каждый договор + «Итого») считаем изменение к
  // предыдущему месяцу по хронологии, затем разворачиваем по tableSort.
  const tableRows = useMemo(() => {
    const chrono = chartRows.filter(r => r.total != null)
    const ids = ['total', ...contractKeys.map(k => `contract_${k.key}`)]
    const enriched = chrono.map((r, i) => {
      const prev = i > 0 ? chrono[i - 1] : null
      const deltas: Record<string, Delta> = {}
      for (const id of ids) {
        const cur = Number(r[id] ?? 0)
        const pv = prev ? Number(prev[id] ?? 0) : null
        const abs = pv != null ? cur - pv : null
        const pct = pv != null && pv !== 0 ? ((cur - pv) / pv) * 100 : null
        deltas[id] = { abs, pct }
      }
      return { row: r, deltas }
    })
    return tableSort === 'desc' ? [...enriched].reverse() : enriched
  }, [chartRows, contractKeys, tableSort])

  // Изменение за весь период: первый → последний месяц (хронологически),
  // по каждому договору и «Итого» — для строки «Итого» в таблице.
  const periodDeltas = useMemo(() => {
    const chrono = chartRows.filter(r => r.total != null)
    if (chrono.length < 2) return null
    const first = chrono[0]
    const last = chrono[chrono.length - 1]
    const ids = ['total', ...contractKeys.map(k => `contract_${k.key}`)]
    const out: Record<string, Delta> = {}
    for (const id of ids) {
      const f = Number(first[id] ?? 0)
      const l = Number(last[id] ?? 0)
      const abs = l - f
      out[id] = { abs, pct: f !== 0 ? (abs / f) * 100 : null }
    }
    return out
  }, [chartRows, contractKeys])

  // Прогноз на 3 месяца вперёд. Строится по ВСЕЙ истории (не по видимому окну),
  // от последнего фактического месяца. Берём СРЕДНИЙ месячный прирост в рублях
  // за последние BASIS мес (арифметическое среднее месячных приростов) отдельно
  // по каждому договору и прибавляем его линейно. «Итого» = сумма прогнозов
  // договоров. Линейная модель консервативнее сложного процента — не «разгоняет».
  const forecast = useMemo(() => {
    const periods = Array.from(byPeriod.keys()).sort((a, b) => a - b)
    if (periods.length < 3) return null // мало истории для осмысленного прогноза

    const contractIds = contractKeys.map(k => `contract_${k.key}`)
    const valAt = (p: number, id: string): number => {
      const e = byPeriod.get(p)
      if (!e) return 0
      if (id === 'total') return e.total
      return e.contracts[id.slice('contract_'.length)] ?? 0
    }

    const HORIZON = 3
    const BASIS = 6 // окно для оценки среднего прироста (последние N месяцев)

    // Средний месячный прирост в рублях за последние BASIS приростов
    const avgStepOf = (id: string): number => {
      const deltas: number[] = []
      for (let i = 1; i < periods.length; i++) {
        deltas.push(valAt(periods[i], id) - valAt(periods[i - 1], id))
      }
      const tail = deltas.slice(-BASIS)
      if (tail.length === 0) return 0
      return tail.reduce((s, d) => s + d, 0) / tail.length
    }

    const step: Record<string, number> = {}
    for (const id of contractIds) step[id] = avgStepOf(id)

    const lastP = periods[periods.length - 1]
    const lastVals: Record<string, number> = { total: valAt(lastP, 'total') }
    for (const id of contractIds) lastVals[id] = valAt(lastP, id)

    // Прогнозные месяцы: линейная экстраполяция + дельта к предыдущему месяцу
    const rows: Array<{ period: number; fullLabel: string; byId: Record<string, number>; deltas: Record<string, Delta> }> = []
    let prevVals = lastVals
    for (let h = 1; h <= HORIZON; h++) {
      const p = addMonths(lastP, h)
      const byId: Record<string, number> = {}
      let total = 0
      for (const id of contractIds) {
        const v = Math.max(0, prevVals[id] + step[id])
        byId[id] = v
        total += v
      }
      byId.total = total
      const deltas: Record<string, Delta> = {}
      for (const id of ['total', ...contractIds]) {
        const abs = byId[id] - prevVals[id]
        deltas[id] = { abs, pct: prevVals[id] !== 0 ? (abs / prevVals[id]) * 100 : null }
      }
      rows.push({ period: p, fullLabel: periodFullLabel(p), byId, deltas })
      prevVals = byId
    }

    // Средний прирост для подписи в шапке (в ₽/мес): по договорам + «Итого»
    const avgStep: Record<string, number> = {}
    for (const id of contractIds) avgStep[id] = step[id]
    avgStep.total = avgStepOf('total')

    const basisMonths = Math.min(BASIS, periods.length - 1)
    return { rows, avgStep, basisMonths, lastPeriod: lastP }
  }, [byPeriod, contractKeys])

  // Данные мини-графика «факт → прогноз»: последние 3 фактических месяца +
  // 3 прогнозных. Для каждой серии две линии: `${id}_a` (факт, сплошная) и
  // `${id}_f` (прогноз, пунктир). Последняя фактическая точка дублируется в
  // `_f`, чтобы пунктир состыковался со сплошной без разрыва.
  const forecastChart = useMemo(() => {
    if (!forecast) return null
    const periods = Array.from(byPeriod.keys()).sort((a, b) => a - b)
    const ids = ['total', ...contractKeys.map(k => `contract_${k.key}`)]
    const valAt = (p: number, id: string): number => {
      const e = byPeriod.get(p)
      if (!e) return 0
      if (id === 'total') return e.total
      return e.contracts[id.slice('contract_'.length)] ?? 0
    }

    type FcRow = Record<string, number | string | boolean | null | Record<string, number>>
    const rows: FcRow[] = []

    for (const p of periods.slice(-3)) {
      const vals: Record<string, number> = {}
      const r: FcRow = { label: periodLabel(p), fullLabel: periodFullLabel(p), isForecast: false, vals }
      for (const id of ids) { const v = valAt(p, id); r[`${id}_a`] = v; r[`${id}_f`] = null; vals[id] = v }
      rows.push(r)
    }
    // Стыковка: последняя фактическая точка = старт пунктира
    if (rows.length) { const last = rows[rows.length - 1]; for (const id of ids) last[`${id}_f`] = last[`${id}_a`] }
    for (const fr of forecast.rows) {
      const vals: Record<string, number> = {}
      const r: FcRow = { label: periodLabel(fr.period), fullLabel: fr.fullLabel, isForecast: true, vals }
      for (const id of ids) { r[`${id}_a`] = null; r[`${id}_f`] = fr.byId[id]; vals[id] = fr.byId[id] }
      rows.push(r)
    }
    return rows
  }, [byPeriod, contractKeys, forecast])

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Финансы · МегаФон · Динамика</h1>
        {years.length > 0 && (
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-xs">
            {([
              { key: 'rolling' as ViewMode, label: '12 мес' },
              ...years.map(y => ({ key: y as ViewMode, label: String(y) })),
            ]).map((opt, i) => (
              <button
                key={String(opt.key)}
                onClick={() => setView(opt.key)}
                className={`px-3 h-8 transition-colors tabular-nums ${i > 0 ? 'border-l border-zinc-200 dark:border-zinc-800' : ''} ${
                  view === opt.key
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
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

          {/* Детализация + прогноз — в две колонки на широких экранах */}
          <div className="mt-6 mb-6 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Таблица с данными */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap min-h-8">
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
                    {tableRows.map(({ row, deltas }) => (
                      <tr key={row.period} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors">
                          <div className="min-h-[44px] flex items-center text-[13px] text-zinc-900 dark:text-zinc-100">
                            {row.fullLabel}
                          </div>
                        </td>
                        {contractKeys.map(k => (
                          <td key={k.key} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                            <ValueDeltaCell value={Number(row[`contract_${k.key}`] ?? 0)} delta={deltas[`contract_${k.key}`]} />
                          </td>
                        ))}
                        <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                          <ValueDeltaCell value={row.total as number} delta={deltas.total} hero />
                        </td>
                      </tr>
                    ))}
                    {/* Итого — суммы по столбцам + изменение за весь период (первый → последний месяц) */}
                    <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                      <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                        <div className="min-h-[44px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                      </td>
                      {contractKeys.map(k => {
                        const sum = tableRows.reduce((s, { row }) => s + Number(row[`contract_${k.key}`] ?? 0), 0)
                        return (
                          <td key={k.key} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                            <ValueDeltaCell value={sum} delta={periodDeltas?.[`contract_${k.key}`]} strong />
                          </td>
                        )
                      })}
                      <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                        <ValueDeltaCell value={tableRows.reduce((s, { row }) => s + Number(row.total ?? 0), 0)} delta={periodDeltas?.total} hero />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Прогноз на 3 месяца */}
          {forecast && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap min-h-8">
                <h2 className="text-base font-semibold">Прогноз на 3 месяца</h2>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  по среднему приросту за {forecast.basisMonths} мес
                </span>
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
                      {forecast.rows.map(fr => (
                        <tr key={fr.period} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                          <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors">
                            <div className="min-h-[44px] flex items-center gap-2 text-[13px] text-zinc-900 dark:text-zinc-100">
                              {fr.fullLabel}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">прогноз</span>
                            </div>
                          </td>
                          {contractKeys.map(k => (
                            <td key={k.key} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                              <ValueDeltaCell value={fr.byId[`contract_${k.key}`]} delta={fr.deltas[`contract_${k.key}`]} />
                            </td>
                          ))}
                          <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                            <ValueDeltaCell value={fr.byId.total} delta={fr.deltas.total} hero />
                          </td>
                        </tr>
                      ))}
                      {/* Итого за 3 месяца прогноза */}
                      <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                        <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                          <div className="min-h-[44px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого за 3 мес</div>
                        </td>
                        {contractKeys.map(k => (
                          <td key={k.key} className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                            <ValueDeltaCell value={forecast.rows.reduce((s, fr) => s + fr.byId[`contract_${k.key}`], 0)} strong />
                          </td>
                        ))}
                        <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right align-middle">
                          <ValueDeltaCell value={forecast.rows.reduce((s, fr) => s + fr.byId.total, 0)} hero />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug">
                Оценка по среднему месячному приросту в ₽ за последние {forecast.basisMonths} мес, отдельно по каждому договору (линейная модель). «Итого» — сумма прогнозов. Это ориентир, не гарантия.
              </p>

              {/* Мини-график: факт (сплошная) → прогноз (пунктир) */}
              {forecastChart && (
                <div className="mt-5 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-gradient-to-b from-white to-zinc-50/60 dark:from-zinc-900 dark:to-zinc-950/40 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-5 pt-4 pb-1 text-[11px]">
                    {series.map(s => (
                      <span key={s.id} className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                        <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                    ))}
                    <span className="ml-auto text-zinc-400 dark:text-zinc-500">сплошная — факт, пунктир — прогноз</span>
                  </div>
                  <div className="px-2 pb-3" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={forecastChart} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
                        <CartesianGrid stroke={colorGrid} strokeDasharray="4 5" vertical={false} />
                        <XAxis
                          dataKey="label"
                          interval={0}
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
                          content={<ForecastTooltip isDark={isDark} series={series} />}
                        />
                        {series.map(s => [
                          <Line
                            key={`${s.id}_a`}
                            type="monotone"
                            dataKey={`${s.id}_a`}
                            stroke={s.color}
                            strokeWidth={s.hero ? 2.5 : 2}
                            strokeLinecap="round"
                            connectNulls={false}
                            dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
                            activeDot={{ r: 4.5, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2, fill: s.color }}
                            isAnimationActive={false}
                          />,
                          <Line
                            key={`${s.id}_f`}
                            type="monotone"
                            dataKey={`${s.id}_f`}
                            stroke={s.color}
                            strokeWidth={s.hero ? 2.5 : 2}
                            strokeDasharray="5 4"
                            strokeLinecap="round"
                            connectNulls={false}
                            dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
                            activeDot={{ r: 4.5, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2, fill: s.color }}
                            isAnimationActive={false}
                          />,
                        ])}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
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

// Тултип мини-графика «факт → прогноз»: значения берём из row.vals,
// помечаем прогнозные месяцы.
function ForecastTooltip({
  active,
  payload,
  isDark,
  series,
}: {
  active?: boolean
  payload?: Array<{ payload?: Record<string, unknown> }>
  isDark: boolean
  series: TooltipSeries[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null
  const vals = row.vals as Record<string, number> | undefined
  if (!vals) return null

  const items = [...series].sort((a, b) => Number(b.hero) - Number(a.hero))

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
      <div style={{ color: isDark ? '#a1a1aa' : '#71717a', fontSize: 11, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {String(row.fullLabel ?? '')}
        {row.isForecast === true && (
          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 5, background: isDark ? '#27272a' : '#f4f4f5', color: isDark ? '#a1a1aa' : '#71717a' }}>прогноз</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
            <span style={{ color: isDark ? '#d4d4d8' : '#52525b', fontSize: 12, flex: 1 }}>{s.label}</span>
            <span
              style={{
                color: isDark ? '#fafafa' : '#18181b',
                fontSize: 12.5,
                fontWeight: s.hero ? 700 : 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtRub(Number(vals[s.id] ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
