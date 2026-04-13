import { useMemo, useState } from 'react'
import type { FinancesData, CategoryMonthly } from './api/payments'
import { PaymentCellModal, type PaymentCellModalProps } from './PaymentCellModal'

const MONTH_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

const fmt = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })

const fmtCurrency = (v: number) =>
  v.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })

// ===================== KPI-карточки =====================

const MONTH_NAMES_SHORT_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null
  const diff = current - previous
  const pct = previous !== 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0
  if (diff === 0) return null

  const isUp = diff > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium mt-1 ${
      isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
    }`}>
      {isUp ? '\u2191' : '\u2193'} {Math.abs(pct)}%
    </span>
  )
}

function SummaryCards({ data }: { data: FinancesData }) {
  const now = new Date()
  const currentMonth = now.getFullYear() === data.year ? now.getMonth() + 1 : 12
  const prevMonth = currentMonth > 1 ? currentMonth - 1 : 12
  const monthName = MONTH_NAMES_SHORT_RU[currentMonth - 1]

  const incomeMonth  = data.incomeTotal[currentMonth] ?? 0
  const incomePrev   = data.incomeTotal[prevMonth] ?? 0
  const expenseMonth = data.expenseTotal[currentMonth] ?? 0
  const expensePrev  = data.expenseTotal[prevMonth] ?? 0
  const profitYear   = data.incomeTotalYear - data.expenseTotalYear
  const profitMonth  = incomeMonth - expenseMonth
  const profitPrev   = incomePrev - expensePrev

  const cards: Array<{
    label: string
    yearVal: number
    monthVal: number
    prevVal: number
    color: string
  }> = [
    { label: 'Выручка',  yearVal: data.incomeTotalYear,  monthVal: incomeMonth,  prevVal: incomePrev,  color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Затраты',  yearVal: data.expenseTotalYear, monthVal: expenseMonth, prevVal: expensePrev, color: 'text-red-500 dark:text-red-400' },
    { label: 'Прибыль',  yearVal: profitYear,            monthVal: profitMonth,  prevVal: profitPrev,  color: profitYear >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
      {cards.map(c => (
        <div key={`y-${c.label}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">{c.label} · год</div>
          <div className={`text-lg font-bold ${c.color} leading-tight`}>
            {fmt(c.yearVal)} <span className="text-xs font-normal opacity-60">&#8381;</span>
          </div>
        </div>
      ))}
      {cards.map(c => (
        <div key={`m-${c.label}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">{c.label} · {monthName}</div>
          <div className={`text-lg font-bold ${c.color} leading-tight`}>
            {fmt(c.monthVal)} <span className="text-xs font-normal opacity-60">&#8381;</span>
          </div>
          <DeltaBadge current={c.monthVal} previous={c.prevVal} />
        </div>
      ))}
    </div>
  )
}

// ===================== Таблица по категориям =====================

function CategoryTable({
  title,
  rows,
  monthTotals,
  yearTotal,
  accentClass,
  onCellClick,
}: {
  title: string
  rows: CategoryMonthly[]
  monthTotals: Record<number, number>
  yearTotal: number
  accentClass: string
  onCellClick: (category: string, month: number) => void
}) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const [sortByMonth, setSortByMonth] = useState<number | null>(null)

  const sorted = useMemo(() => {
    if (!rows.length) return rows
    return [...rows].sort((a, b) => {
      if (sortByMonth != null) {
        const ca = a.months[sortByMonth] ?? 0
        const cb = b.months[sortByMonth] ?? 0
        if (cb !== ca) return cb - ca
      } else {
        if (b.total !== a.total) return b.total - a.total
      }
      return a.category.localeCompare(b.category, 'ru')
    })
  }, [rows, sortByMonth])

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold mb-3">{title}</h2>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  style={{ width: 240, minWidth: 240, height: 44 }}
                >
                  Категория
                </th>
                {months.map(m => {
                  const isSorted = sortByMonth === m
                  return (
                    <th
                      key={m}
                      className={`border-b border-l border-zinc-200 dark:border-zinc-800 p-0 text-center cursor-pointer select-none transition-colors ${
                        isSorted
                          ? 'bg-emerald-50 dark:bg-emerald-950/40'
                          : 'bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                      style={{ width: 90, minWidth: 90 }}
                      onClick={() => setSortByMonth(prev => prev === m ? null : m)}
                    >
                      <div className="flex flex-col items-center justify-center py-1.5">
                        <span className={`text-[11px] leading-none font-semibold uppercase tracking-wide ${
                          isSorted ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {MONTH_SHORT[m - 1]}{isSorted ? ' \u25BC' : ''}
                        </span>
                      </div>
                    </th>
                  )
                })}
                <th
                  className={`border-b border-l border-zinc-200 dark:border-zinc-800 text-center text-xs font-medium cursor-pointer select-none transition-colors ${
                    sortByMonth == null
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  style={{ width: 100, minWidth: 100 }}
                  onClick={() => setSortByMonth(null)}
                >
                  Итого{sortByMonth == null ? ' \u25BC' : ''}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={months.length + 2} className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Нет данных
                  </td>
                </tr>
              )}

              {sorted.map(r => (
                <tr key={r.category} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors">
                    <div className="h-[36px] flex items-center text-[13px] text-zinc-900 dark:text-zinc-100 truncate" style={{ maxWidth: 220 }}>
                      {r.category}
                    </div>
                  </td>
                  {months.map(m => {
                    const v = r.months[m] ?? 0
                    const isSorted = sortByMonth === m
                    return (
                      <td key={m} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${
                        isSorted ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                      }`}>
                        {v > 0 ? (
                          <button
                            type="button"
                            onClick={() => onCellClick(r.category, m)}
                            className={`w-full h-[36px] flex items-center justify-center text-[12px] font-semibold cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${accentClass}`}
                            title={`${r.category} — ${MONTH_SHORT[m - 1]}: ${fmt(v)} ₽`}
                          >
                            {fmt(v)}
                          </button>
                        ) : (
                          <div className="h-[36px] flex items-center justify-center text-[12px] font-semibold text-zinc-300 dark:text-zinc-700">
                            {'\u2014'}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                    <div className="h-[36px] flex items-center justify-center text-[12px] font-bold text-zinc-900 dark:text-zinc-100 px-2">
                      {fmt(r.total)}
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length > 0 && (
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                  <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                    <div className="h-[36px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                  </td>
                  {months.map(m => {
                    const t = monthTotals[m] ?? 0
                    return (
                      <td key={m} className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                        <div className={`h-[36px] flex items-center justify-center text-[12px] font-semibold ${
                          t > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-700'
                        }`}>
                          {t > 0 ? fmt(t) : '0'}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100 dark:bg-zinc-800/60">
                    <div className="h-[36px] flex items-center justify-center text-[12px] font-bold px-2 text-zinc-900 dark:text-zinc-100">
                      {fmt(yearTotal)}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===================== Скелетон =====================

function TableSkeleton() {
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  return (
    <div className="mb-6">
      <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse mb-3" />
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4" style={{ width: 240, minWidth: 240, height: 44 }}>
                  <div className="h-2.5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                </th>
                {months.map(m => (
                  <th key={m} className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900" style={{ width: 90, minWidth: 90 }}>
                    <div className="h-2.5 w-8 mx-auto bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse my-2" />
                  </th>
                ))}
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900" style={{ width: 100, minWidth: 100 }}>
                  <div className="h-2.5 w-10 mx-auto bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse my-2" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 px-4">
                    <div className="h-[36px] flex items-center">
                      <div className="h-2.5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                    </div>
                  </td>
                  {months.map(m => (
                    <td key={m} className="border-l border-zinc-200 dark:border-zinc-800 p-0"><div className="h-[36px]" /></td>
                  ))}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0"><div className="h-[36px]" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===================== MAIN COMPONENT =====================

interface FinancesReportProps {
  title: string
  data: FinancesData | null
  loading: boolean
  syncing: boolean
  error: string | null
  year: number
  onYearChange: (y: number) => void
  onSync: () => void
}

export function FinancesReport({
  title,
  data,
  loading,
  syncing,
  error,
  year,
  onYearChange,
  onSync,
}: FinancesReportProps) {
  const busy = loading || syncing
  const [modal, setModal] = useState<Omit<PaymentCellModalProps, 'onClose'> | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onYearChange(year - 1)}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >{'\u2039'}</button>
          <div className="min-w-[80px] text-center text-sm font-semibold">
            {year}{busy ? ' \u2026' : ''}
          </div>
          <button
            onClick={() => onYearChange(year + 1)}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >{'\u203A'}</button>
          <button
            onClick={onSync}
            disabled={busy}
            className="ml-2 px-3 h-8 rounded-lg border border-zinc-200 bg-white text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >
            {syncing ? 'Синхронизация\u2026' : loading ? 'Загрузка\u2026' : 'Обновить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
                <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse mb-2" />
                <div className="h-6 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
          <TableSkeleton />
          <TableSkeleton />
        </>
      )}

      {!loading && data && (
        <>
          <SummaryCards data={data} />

          <CategoryTable
            title="Поступления"
            rows={data.income}
            monthTotals={data.incomeTotal}
            yearTotal={data.incomeTotalYear}
            accentClass="text-emerald-700 dark:text-emerald-300"
            onCellClick={(category, month) => setModal({ category, type: 'income', year, month })}
          />

          <CategoryTable
            title="Затраты"
            rows={data.expense}
            monthTotals={data.expenseTotal}
            yearTotal={data.expenseTotalYear}
            accentClass="text-red-600 dark:text-red-400"
            onCellClick={(category, month) => setModal({ category, type: 'expense', year, month })}
          />
        </>
      )}

      {modal && (
        <PaymentCellModal
          {...modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
