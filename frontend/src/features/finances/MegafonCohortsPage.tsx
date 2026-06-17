import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMegafonCohorts,
  type MegafonCohorts,
  type CohortCompany,
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

// Вознаграждение хранится в копейках → рубли, формат «12 345 ₽» без копеек
const fmtRub = (kop: number) =>
  Math.round(kop / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽'

// Плейсхолдер МегаФона для ИП/физлиц — ФИО в отчёте не раскрывается
const PLACEHOLDER_NAME = 'ФИО физ. лиц или ИП не выводится в отчет'

// Отображаемое имя компании: реальное наименование, иначе «ИП {ИНН}»
function displayName(c: CohortCompany): string {
  const n = (c.name ?? '').trim()
  if (n && n !== PLACEHOLDER_NAME) return n
  if (c.inn) return `ИП ${c.inn}`
  return c.key
}
// ИНН-строка под именем (12 знаков = ИП/физлицо, 10 = юр.лицо)
function innSuffix(c: CohortCompany): string | null {
  if (!c.inn) return null
  return c.inn
}

type SortDir = 'desc' | 'asc'

interface Group {
  cohort: number
  companies: CohortCompany[]
  total: number
}

export function MegafonCohortsPage() {
  const [data, setData] = useState<MegafonCohorts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [contract, setContract] = useState<'all' | '1' | '2'>('all')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchMegafonCohorts())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const periods = data?.periods ?? []

  // Фильтрация + группировка по месяцу подключения
  const { groups, grandTotal, totalCompanies, colTotals } = useMemo(() => {
    const empty = { groups: [] as Group[], grandTotal: 0, totalCompanies: 0, colTotals: {} as Record<number, number> }
    if (!data) return empty

    const q = query.trim().toLowerCase()
    const filtered = data.companies.filter((c) => {
      if (contract !== 'all' && c.contractId !== contract) return false
      if (!q) return true
      const hay = `${c.name ?? ''} ${c.inn ?? ''} ${displayName(c)}`.toLowerCase()
      return hay.includes(q)
    })

    // Группировка по cohort
    const byCohort = new Map<number, CohortCompany[]>()
    for (const c of filtered) {
      const arr = byCohort.get(c.cohort)
      if (arr) arr.push(c); else byCohort.set(c.cohort, [c])
    }

    const groups: Group[] = Array.from(byCohort.entries()).map(([cohort, companies]) => {
      companies.sort((a, b) => b.totalReward - a.totalReward)
      const total = companies.reduce((s, c) => s + c.totalReward, 0)
      return { cohort, companies, total }
    })
    groups.sort((a, b) => sortDir === 'desc' ? b.cohort - a.cohort : a.cohort - b.cohort)

    const colTotals: Record<number, number> = {}
    let grandTotal = 0
    for (const c of filtered) {
      grandTotal += c.totalReward
      for (const p of periods) colTotals[p] = (colTotals[p] ?? 0) + (c.rewardByPeriod[p] ?? 0)
    }

    return { groups, grandTotal, totalCompanies: filtered.length, colTotals }
  }, [data, query, contract, sortDir, periods])

  const hasData = (data?.companies.length ?? 0) > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Финансы · МегаФон · Компании по месяцам</h1>
        <button
          onClick={() => void load()}
          disabled={loading}
          title="Обновить данные"
          className="px-3 h-8 rounded-lg border border-zinc-200 bg-white text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
            <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Обновить
        </button>
      </div>
      <p className="text-[12px] text-zinc-400 dark:text-zinc-500 mb-5 leading-snug">
        Месяц подключения — по самой ранней активации SIM. Все суммы — вознаграждение <b>без НДС</b> (отчёты до 2026 пересчитаны −20% для сопоставимости).
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm p-4" style={{ height: 300 }}>
          <div className="h-full flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
          </div>
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* Тулбар: поиск, фильтр по договору, сортировка, сводка */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по названию или ИНН"
                  className="h-8 w-64 pl-8 pr-3 rounded-lg border border-zinc-200 bg-white text-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-xs">
                {([
                  { key: 'all' as const, label: 'Все договоры' },
                  { key: '1' as const, label: 'АСМ 2015' },
                  { key: '2' as const, label: 'B2B 2018' },
                ]).map((opt, i) => (
                  <button
                    key={opt.key}
                    onClick={() => setContract(opt.key)}
                    className={`px-3 h-8 transition-colors ${i > 0 ? 'border-l border-zinc-200 dark:border-zinc-800' : ''} ${
                      contract === opt.key
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-xs">
                <button
                  onClick={() => setSortDir('desc')}
                  className={`px-3 h-8 transition-colors ${sortDir === 'desc' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                >
                  Сначала новые
                </button>
                <button
                  onClick={() => setSortDir('asc')}
                  className={`px-3 h-8 border-l border-zinc-200 dark:border-zinc-800 transition-colors ${sortDir === 'asc' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                >
                  Сначала старые
                </button>
              </div>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Компаний: <b className="text-zinc-700 dark:text-zinc-200">{totalCompanies}</b>
              <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
              Вознаграждение всего: <b className="text-emerald-600 dark:text-emerald-400">{fmtRub(grandTotal)}</b>
            </div>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="border-collapse w-full text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-30 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-3 text-left font-medium text-zinc-500 dark:text-zinc-400 h-10 min-w-[260px]">
                      Компания
                    </th>
                    {periods.map((p) => (
                      <th key={p} className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right font-medium text-zinc-500 dark:text-zinc-400 h-10 whitespace-nowrap tabular-nums">
                        {periodLabel(p)}
                      </th>
                    ))}
                    <th className="border-b border-l-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400 h-10 whitespace-nowrap">
                      Итого
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <CohortGroup key={g.cohort} group={g} periods={periods} />
                  ))}
                  {/* Итого по столбцам (видимые компании) */}
                  <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/80">
                    <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-3 h-11 font-semibold text-zinc-600 dark:text-zinc-300">
                      Итого по месяцу
                    </td>
                    {periods.map((p) => (
                      <td key={p} className="border-l border-zinc-200 dark:border-zinc-800 px-3 text-right tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                        {colTotals[p] ? fmtRub(colTotals[p]) : <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                      </td>
                    ))}
                    <td className="border-l-2 border-zinc-200 dark:border-zinc-800 px-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtRub(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {totalCompanies === 0 && (
            <div className="text-center py-10 text-sm text-zinc-500 dark:text-zinc-400">Ничего не найдено по фильтру.</div>
          )}
        </>
      )}

      {!loading && !hasData && !error && (
        <div className="text-center py-16 text-sm text-zinc-500 dark:text-zinc-400">
          Нет данных. Загрузите xlsx-отчёты МегаФон на вкладке «МегаФон».
        </div>
      )}
    </div>
  )
}

// ===================== Группа когорты =====================

function CohortGroup({ group, periods }: { group: Group; periods: number[] }) {
  const someApprox = group.companies.some((c) => c.cohortApprox)
  return (
    <>
      {/* Заголовок месяца подключения */}
      <tr className="bg-indigo-50/60 dark:bg-indigo-950/30">
        <td className="sticky left-0 z-10 bg-indigo-50/60 dark:bg-indigo-950/30 border-y border-r border-zinc-200 dark:border-zinc-800 px-3 h-9">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{periodFullLabel(group.cohort)}</span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">· {group.companies.length}</span>
            {someApprox && (
              <span
                title="У части компаний нет даты активации — для них это первый месяц появления в отчётах (подключились не позже)"
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              >
                ≤ не позже
              </span>
            )}
          </div>
        </td>
        <td colSpan={periods.length} className="border-y border-l border-zinc-200 dark:border-zinc-800 bg-indigo-50/60 dark:bg-indigo-950/30" />
        <td className="border-y border-l-2 border-zinc-200 dark:border-zinc-800 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 text-right tabular-nums font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
          {fmtRub(group.total)}
        </td>
      </tr>
      {/* Строки компаний */}
      {group.companies.map((c) => (
        <tr key={c.key} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
          <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-3 py-1.5 transition-colors">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate max-w-[220px]" title={displayName(c)}>{displayName(c)}</span>
              {c.cohortApprox && (
                <span title="Дата активации неизвестна — подключение не позже месяца когорты" className="text-amber-500 dark:text-amber-400 text-[11px]">≤</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10.5px] text-zinc-400 dark:text-zinc-500">
              {innSuffix(c) && <span className="tabular-nums">ИНН {innSuffix(c)}</span>}
              <span className="text-zinc-300 dark:text-zinc-600">{c.contractId === '1' ? 'АСМ' : c.contractId === '2' ? 'B2B' : c.contractLabel}</span>
            </div>
          </td>
          {periods.map((p) => {
            const v = c.rewardByPeriod[p] ?? 0
            const isCohortMonth = p === c.cohort
            return (
              <td
                key={p}
                className={`border-l border-zinc-100 dark:border-zinc-800/60 px-3 text-right tabular-nums ${
                  v > 0 ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-700'
                } ${isCohortMonth ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
              >
                {v > 0 ? fmtRub(v) : '—'}
              </td>
            )
          })}
          <td className="border-l-2 border-zinc-200 dark:border-zinc-800 px-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            {fmtRub(c.totalReward)}
          </td>
        </tr>
      ))}
    </>
  )
}
