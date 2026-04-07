import { useMemo, useState } from 'react'

export interface MonthlyTotalsChartProps {
  /** Дни месяца, которые должны быть на оси X (1..N) */
  days: number[]
  /** Количество оформлений по дням текущего месяца: { day: count } */
  current: Record<number, number>
  /** Количество оформлений по дням предыдущего месяца — для серой линии-сравнения */
  previous: Record<number, number>
  currentLabel:  string // напр. "Апрель 2026"
  previousLabel: string // напр. "Март 2026"
}

/**
 * Кастомный SVG line chart: текущий месяц (emerald area + line) + предыдущий
 * месяц (серая линия для сравнения). Без зависимостей от chart-библиотек.
 */
export function MonthlyTotalsChart({
  days,
  current,
  previous,
  currentLabel,
  previousLabel,
}: MonthlyTotalsChartProps) {
  // Логические размеры viewBox — фиксированные, SVG масштабируется по контейнеру
  const W = 800
  const H = 220
  const PAD_L = 36
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 28

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const currentValues  = useMemo(() => days.map(d => current[d]  ?? 0), [days, current])
  const previousValues = useMemo(() => days.map(d => previous[d] ?? 0), [days, previous])

  const maxValue = useMemo(() => {
    const m = Math.max(0, ...currentValues, ...previousValues)
    return m === 0 ? 1 : niceCeil(m)
  }, [currentValues, previousValues])

  // 4 горизонтальные линии сетки + ось X (0)
  const ticks = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i <= 4; i++) out.push(Math.round((maxValue / 4) * i))
    return out
  }, [maxValue])

  function xFor(i: number): number {
    if (days.length <= 1) return PAD_L + innerW / 2
    return PAD_L + (innerW * i) / (days.length - 1)
  }
  function yFor(v: number): number {
    return PAD_T + innerH - (innerH * v) / maxValue
  }

  const currentPoints  = currentValues.map((v, i) => [xFor(i), yFor(v)] as const)
  const previousPoints = previousValues.map((v, i) => [xFor(i), yFor(v)] as const)

  const currentLinePath  = smoothPath(currentPoints)
  const previousLinePath = smoothPath(previousPoints)
  const currentAreaPath  = currentLinePath
    + ` L ${currentPoints[currentPoints.length - 1][0]} ${PAD_T + innerH}`
    + ` L ${currentPoints[0][0]} ${PAD_T + innerH} Z`

  // Hover-state: показываем вертикальную линию + значения для дня под курсором
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    // переводим клиентские координаты в координаты viewBox
    const xViewBox = ((e.clientX - rect.left) / rect.width) * W
    if (xViewBox < PAD_L || xViewBox > PAD_L + innerW) {
      setHoverIdx(null)
      return
    }
    const rel = (xViewBox - PAD_L) / innerW
    const idx = Math.round(rel * (days.length - 1))
    setHoverIdx(Math.max(0, Math.min(days.length - 1, idx)))
  }

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

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="sim-area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgb(16,185,129)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Сетка + подписи Y */}
        {ticks.map((t) => {
          const y = yFor(t)
          return (
            <g key={t}>
              <line
                x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                className="stroke-zinc-200 dark:stroke-zinc-800"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 8} y={y + 3}
                textAnchor="end"
                className="fill-zinc-400 dark:fill-zinc-600"
                style={{ fontSize: 10 }}
              >
                {t}
              </text>
            </g>
          )
        })}

        {/* Подписи X — каждый 5-й день + первый и последний */}
        {days.map((d, i) => {
          const show = d === 1 || d === days.length || d % 5 === 0
          if (!show) return null
          return (
            <text
              key={d}
              x={xFor(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-zinc-400 dark:fill-zinc-600"
              style={{ fontSize: 10 }}
            >
              {d}
            </text>
          )
        })}

        {/* Линия предыдущего месяца — пунктир, серая */}
        <path
          d={previousLinePath}
          fill="none"
          className="stroke-zinc-400 dark:stroke-zinc-600"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Заливка под текущей линией */}
        <path d={currentAreaPath} fill="url(#sim-area-gradient)" />

        {/* Текущая линия — emerald */}
        <path
          d={currentLinePath}
          fill="none"
          className="stroke-emerald-500"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover-индикатор */}
        {hoverIdx != null && (
          <g>
            <line
              x1={xFor(hoverIdx)} y1={PAD_T}
              x2={xFor(hoverIdx)} y2={PAD_T + innerH}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={xFor(hoverIdx)}
              cy={yFor(currentValues[hoverIdx])}
              r="3.5"
              className="fill-emerald-500 stroke-white dark:stroke-zinc-900"
              strokeWidth="1.5"
            />
            {previousValues[hoverIdx] > 0 && (
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(previousValues[hoverIdx])}
                r="3"
                className="fill-zinc-400 dark:fill-zinc-500 stroke-white dark:stroke-zinc-900"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}
      </svg>

      {hoverIdx != null && (
        <div className="mt-1 flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            {days[hoverIdx]} число
          </span>
          <span>
            <span className="text-zinc-900 dark:text-zinc-100 font-semibold">
              {currentValues[hoverIdx]}
            </span>
            <span className="ml-1">шт.</span>
          </span>
          <span>
            прошлый месяц:{' '}
            <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
              {previousValues[hoverIdx]}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Сглаживание линии через Catmull-Rom → cubic Bezier.
 * Даёт мягкие кривые без зависимости от d3/chart-библиотек.
 */
function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M ${x} ${y}`
  }
  const tension = 0.5
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2
    const cp1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2
    const cp2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2
    const cp2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

/**
 * Округляет максимум вверх до "красивого" числа (1, 2, 5 × 10^k).
 * Чтобы метки на оси Y были человекочитаемыми.
 */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const m = v / base
  let nice: number
  if      (m <= 1) nice = 1
  else if (m <= 2) nice = 2
  else if (m <= 5) nice = 5
  else             nice = 10
  return nice * base
}
