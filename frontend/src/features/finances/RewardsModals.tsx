import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  accrueRewards,
  fetchAccrualPreview,
  fetchDealsCheck,
  type CheckReason,
  type DealsCheck,
  fetchPayouts,
  setRewardsPaid,
  type AccrualPreview,
  type AccrualRow,
  type AccrualStatus,
  type Payouts,
  type PayoutRow,
} from './api/megafon'

// Вознаграждение сотрудникам за подключённых клиентов (воронка «МегаФон Корп клиенты»).
// Начисление = начисления клиента за первый ПОЛНЫЙ месяц (подключили 15 авг → считаем сентябрь).

const MONTH_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const MONTH_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const periodTitle = (p: number) => `${MONTH_FULL[p % 100 - 1]} ${Math.floor(p / 100)}`
const prevPeriod = (p: number) => (p % 100 === 1 ? p - 89 : p - 1)
const addMonths = (p: number, n: number) => {
  const i = Math.floor(p / 100) * 12 + (p % 100 - 1) + n
  return Math.floor(i / 12) * 100 + (i % 12) + 1
}
const MONTH_PREP = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
]
const fmtRub = (kop: number) =>
  (kop / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽'
const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTH_GEN[m - 1]} ${y}`
}
/** Вознаграждение сотрудника, копейки, округлено до рубля (та же формула на сервере). */
const rewardOf = (chargesKop: number, ratePct: number) => Math.round(chargesKop * ratePct / 100 / 100) * 100
const RATE_KEY = 'megafon-rewards-rate'
const readRate = () => {
  try { const v = Number(localStorage.getItem(RATE_KEY)); return v > 0 && v <= 100 ? v : 15 } catch { return 15 }
}
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return many
  if (m10 === 1) return one
  if (m10 >= 2 && m10 <= 4) return few
  return many
}
const deals = (n: number) => `${n} ${plural(n, 'сделка', 'сделки', 'сделок')}`

// ───────────────────────── общий каркас модалки ─────────────────────────

function Modal({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
            {subtitle && <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Закрыть"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors">
            &#x2715;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

const ErrorBox = ({ text }: { text: string }) => (
  <div className="m-5 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm whitespace-pre-wrap">
    {text}
  </div>
)
const Spinner = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="h-5 w-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
  </div>
)

function PeriodSelect({ value, options, onChange, mark }: {
  value: number | null; options: number[]; onChange: (p: number) => void; mark?: (p: number) => string
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(Number(e.target.value))}
      className="h-8 px-2 rounded-lg border border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
    >
      {options.map(p => <option key={p} value={p}>{periodTitle(p)}{mark?.(p) ?? ''}</option>)}
    </select>
  )
}

const primaryBtn = 'px-4 h-9 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

function groupByManager<T extends { managerId: number; manager: string }>(rows: T[]) {
  const m = new Map<number, { manager: string; rows: T[] }>()
  for (const r of rows) {
    const g = m.get(r.managerId)
    if (g) g.rows.push(r); else m.set(r.managerId, { manager: r.manager, rows: [r] })
  }
  return [...m.entries()].map(([id, g]) => ({ id, ...g })).sort((a, b) => a.manager.localeCompare(b.manager, 'ru'))
}

const dealTitle = (r: { company: string | null; dealName: string | null; dealId: number }) =>
  r.company || r.dealName || `Сделка #${r.dealId}`

// ───────────────────────── «Начислить вознаграждение» ─────────────────────────

const STATUS_INFO: Record<AccrualStatus, { label: string; cls: string }> = {
  ready:     { label: 'к начислению',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' },
  accrued:   { label: 'уже начислено',       cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  overdue:   { label: 'пропущено',           cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' },
  no_inn:    { label: 'нет ИНН',             cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
  paid:      { label: 'выплачено ранее',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' },
  not_found: { label: 'нет в отчётах МФ',    cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
  early:     { label: 'ещё рано',            cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
  other:     { label: 'начислено ранее',     cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
}

function statusHint(r: AccrualRow): string {
  switch (r.status) {
    case 'overdue':   return r.fullMonth ? `Полный месяц был ${periodTitle(r.fullMonth).toLowerCase()} — выберите его вверху` : ''
    case 'no_inn':    return 'Заполните ИНН в сделке или компании amoCRM'
    case 'not_found': return 'Клиента с таким ИНН нет в загруженных отчётах МегаФон'
    case 'early':     return r.fullMonth ? `Первый полный месяц — ${periodTitle(r.fullMonth).toLowerCase()}` : 'Начислений по клиенту ещё не было'
    case 'other':     return r.currentPeriod ? `Начислено за ${periodTitle(r.currentPeriod).toLowerCase()}: ${fmtRub(r.currentAmount ?? 0)}` : ''
    case 'accrued':   return `В сделке: ${fmtRub(r.currentAmount ?? 0)}. Отметьте, чтобы пересчитать`
    case 'paid':      return r.currentPeriod
      ? `Выплачено за ${periodTitle(r.currentPeriod).toLowerCase()}: ${fmtRub(r.currentAmount ?? 0)}`
      : 'Выплачено ранее (отчётный период в сделке не указан)'
    case 'ready':     return r.inReport ? '' : 'В отчёте за этот месяц клиента нет — начислений 0 ₽'
  }
}

export function AccrueRewardsModal({ periods, onClose }: { periods: number[]; onClose: () => void }) {
  const options = useMemo(() => [...periods].sort((a, b) => b - a), [periods])
  const [period, setPeriod] = useState<number | null>(options[0] ?? null)
  const [data, setData] = useState<AccrualPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showRest, setShowRest] = useState(false)
  const [rate, setRate] = useState<number>(readRate)
  const rateOk = rate > 0 && rate <= 100
  const changeRate = (v: number) => {
    setRate(v)
    try { if (v > 0 && v <= 100) localStorage.setItem(RATE_KEY, String(v)) } catch { /* noop */ }
  }

  const load = useCallback(async (p: number, refresh = false) => {
    setLoading(true); setError(null)
    try {
      const d = await fetchAccrualPreview(p, refresh)
      setData(d)
      // По умолчанию отмечены только «к начислению»
      setSelected(new Set(d.rows.filter(r => r.status === 'ready' && r.inReport).map(r => r.dealId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setData(null)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (period) { setDone(null); void load(period) } }, [period, load])

  const rows = data?.rows ?? []
  // Выплаченные за этот месяц тоже показываем в основном списке (без галочки), чтобы было видно всю картину
  const paidHere = (r: AccrualRow) => r.status === 'paid' &&
    (r.currentPeriod === period || (r.currentPeriod == null && r.fullMonth === period))
  const main = rows.filter(r => r.status === 'ready' || r.status === 'accrued' || paidHere(r))
  // «Требуют внимания» — только свежие сделки: полный месяц в пределах 3 мес. до выбранного.
  // Старые (2017-й и т.п.) без ИНН — не шум в основном списке, а в «Остальных».
  const isProblem = (r: AccrualRow) => r.status === 'overdue' || r.status === 'no_inn' || r.status === 'not_found'
  const isRecent = (r: AccrualRow) => !!period && r.fullMonth != null && r.fullMonth >= addMonths(period, -3) && r.fullMonth <= period
  const attention = rows.filter(r => isProblem(r) && isRecent(r))
  const rest = rows.filter(r => !main.includes(r) && !attention.includes(r))
  const chosen = rows.filter(r => selected.has(r.dealId))
  const chosenSum = chosen.reduce((s, r) => s + rewardOf(r.charges, rate), 0)

  const toggle = (ids: number[], on: boolean) => setSelected(prev => {
    const n = new Set(prev); for (const id of ids) on ? n.add(id) : n.delete(id); return n
  })

  async function submit() {
    if (!period || !chosen.length) return
    setSaving(true); setError(null)
    try {
      const res = await accrueRewards(period, chosen.map(r => r.dealId), rate)
      setDone(`Записано в amoCRM: ${deals(res.updated)} на ${fmtRub(res.total)} за ${periodTitle(period).toLowerCase()}`)
      await load(period)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Начислить вознаграждение"
      subtitle={data ? `Воронка «${data.pipelineName}» · успешные сделки: ${rows.length}` : 'Воронка «МегаФон Корп клиенты»'}
      onClose={onClose}
      footer={
        <>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Выбрано: <b className="text-zinc-800 dark:text-zinc-100">{deals(chosen.length)}</b>
            <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
            Вознаграждение ({rate}%): <b className="text-emerald-600 dark:text-emerald-400">{fmtRub(chosenSum)}</b>
          </div>
          <button className={primaryBtn} disabled={!chosen.length || saving || loading || !rateOk} onClick={() => void submit()}>
            {saving ? 'Записываю…' : 'Записать в amoCRM'}
          </button>
        </>
      }
    >
      <div className="px-5 pt-4 pb-3 flex items-center gap-3 flex-wrap border-b border-zinc-100 dark:border-zinc-800/60">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Отчётный период</span>
        <PeriodSelect value={period} options={options} onChange={setPeriod}
          mark={p => ` · начисления с ${MONTH_GEN[prevPeriod(p) % 100 - 1]}`} />
        <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">Ставка</span>
        <div className="relative">
          <input
            type="number" min={1} max={100} step={0.5} value={rate}
            onChange={e => changeRate(Number(e.target.value))}
            className={`h-8 w-16 pl-2 pr-5 rounded-lg border bg-white text-xs tabular-nums dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${rateOk ? 'border-zinc-200 dark:border-zinc-700' : 'border-red-400'}`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">%</span>
        </div>
        <button
          onClick={() => { if (period) { setDone(null); void load(period, true) } }}
          disabled={loading || !period}
          title="Перечитать сделки из amoCRM (по умолчанию берутся из кэша, обновляется раз в 15 минут)"
          className="ml-auto px-2.5 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
        >
          ↻ Обновить из amoCRM
        </button>
        {period && (
          <span className="text-[11.5px] text-zinc-400 dark:text-zinc-500">
            Клиенты, у которых начисления пошли в {MONTH_PREP[prevPeriod(period) % 100 - 1]}: {periodTitle(period).toLowerCase()} — их первый полный месяц. Вознаграждение = начисления клиента за месяц (без НДС) × ставка сотрудника.
          </span>
        )}
      </div>

      {done && (
        <div className="mx-5 mt-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 text-sm">
          ✓ {done}
        </div>
      )}
      {error && <ErrorBox text={error} />}
      {loading && <Spinner />}

      {!loading && data && (
        <div className="pb-4">
          {!data.reportLoaded && (
            <div className="mx-5 mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 text-sm">
              Отчёт МегаФон за {periodTitle(data.period).toLowerCase()} ещё не загружен — суммы будут нулевыми.
            </div>
          )}

          {main.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Нет сделок, у которых {periodTitle(data.period).toLowerCase()} — первый полный месяц.
            </div>
          ) : (
            <ManagerTable
              rows={main}
              amoUrl={data.amoUrl}
              selected={selected}
              onToggle={toggle}
              amount={r => r.status === 'paid' ? (r.currentAmount ?? 0) : rewardOf(r.charges, rate)}
              sub={r => r.status === 'paid' ? 'из сделки' : `начисления ${fmtRub(r.charges)}`}
            />
          )}

          {attention.length > 0 && (
            <Section title={`Требуют внимания · ${attention.length}`} tone="amber">
              <ManagerTable rows={attention} amoUrl={data.amoUrl} amount={r => rewardOf(r.charges, rate)} sub={r => `начисления ${fmtRub(r.charges)}`} />
            </Section>
          )}

          {rest.length > 0 && (
            <div className="px-5 mt-3">
              <button onClick={() => setShowRest(v => !v)} className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
                {showRest ? '▾' : '▸'} Остальные сделки ({rest.length}): начислены ранее, полный месяц ещё не наступил или давно прошёл
              </button>
            </div>
          )}
          {showRest && rest.length > 0 && (
            <ManagerTable rows={rest} amoUrl={data.amoUrl} amount={r => r.currentAmount ?? 0} />
          )}
        </div>
      )}
    </Modal>
  )
}

function Section({ title, tone, children }: { title: string; tone: 'amber'; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className={`px-5 py-2 text-xs font-semibold ${tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : ''}`}>{title}</div>
      {children}
    </div>
  )
}

function ManagerTable({ rows, amoUrl, selected, onToggle, amount, sub }: {
  rows: AccrualRow[]
  amoUrl: string
  selected?: Set<number>
  onToggle?: (ids: number[], on: boolean) => void
  amount: (r: AccrualRow) => number
  sub?: (r: AccrualRow) => string
}) {
  const groups = groupByManager(rows)
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {groups.map(g => {
          const selectable = g.rows.filter(r => r.selectable).map(r => r.dealId)
          const allOn = !!selected && selectable.length > 0 && selectable.every(id => selected.has(id))
          const sum = g.rows.filter(r => !selected || selected.has(r.dealId)).reduce((s, r) => s + amount(r), 0)
          return (
            <ManagerGroup key={g.id}
              head={
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <td className="pl-5 pr-2 w-8 py-2">
                    {selected && onToggle && selectable.length > 0 && (
                      <input type="checkbox" checked={allOn} onChange={e => onToggle(selectable, e.target.checked)} className="accent-indigo-600" />
                    )}
                  </td>
                  <td className="py-2 font-semibold text-zinc-700 dark:text-zinc-200" colSpan={3}>
                    {g.manager} <span className="font-normal text-zinc-400">· {g.rows.length}</span>
                  </td>
                  <td className="pr-5 py-2 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {selected ? fmtRub(sum) : ''}
                  </td>
                </tr>
              }
            >
              {g.rows.map(r => {
                const st = STATUS_INFO[r.status]
                const hint = statusHint(r)
                return (
                  <tr key={r.dealId} className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                    <td className="pl-5 pr-2 w-8 py-2 align-top">
                      {selected && onToggle && r.selectable && (
                        <input type="checkbox" checked={selected.has(r.dealId)} onChange={e => onToggle([r.dealId], e.target.checked)} className="accent-indigo-600 mt-0.5" />
                      )}
                    </td>
                    <td className="py-2 align-top">
                      <a href={`${amoUrl}/leads/detail/${r.dealId}`} target="_blank" rel="noreferrer noopener"
                        className="text-[13px] text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                        {dealTitle(r)} <span className="text-zinc-400">↗</span>
                      </a>
                      <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {r.inn ? `ИНН ${r.inn}` : 'ИНН не указан'}
                        {r.innSource === 'name' && <span className="ml-1 text-amber-500" title="ИНН подобран по совпадению названия с отчётом МегаФон — проверьте">· по названию</span>}
                        {hint && <span className="ml-2 text-zinc-500 dark:text-zinc-400">· {hint}</span>}
                      </div>
                    </td>
                    <td className="py-2 align-top whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      <div title="Первый месяц, в котором у клиента появились начисления (отчёт МегаФон)">
                        {r.firstChargeMonth ? `начисления с ${periodTitle(r.firstChargeMonth).toLowerCase()}` : 'начислений нет'}
                      </div>
                      {r.connectedOn && <div className="text-[10px] text-zinc-400 dark:text-zinc-600">рег. {fmtDate(r.connectedOn)}</div>}
                    </td>
                    <td className="py-2 align-top px-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${st.cls}`}>{st.label}</span>
                      <div
                        title="Галочка «Вознаграждение выплачено» в сделке amoCRM"
                        className={`mt-1 text-[10px] whitespace-nowrap ${r.paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}
                      >
                        {r.paid ? '☑ выплачено' : '☐ не выплачено'}
                      </div>
                    </td>
                    <td className="pr-5 py-2 align-top text-right tabular-nums text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                      {fmtRub(amount(r))}
                      {sub && <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{sub(r)}</div>}
                    </td>
                  </tr>
                )
              })}
            </ManagerGroup>
          )
        })}
      </tbody>
    </table>
  )
}

const ManagerGroup = ({ head, children }: { head: ReactNode; children: ReactNode }) => <>{head}{children}</>

// ───────────────────────── «Вознаграждение выплачено» ─────────────────────────

export function PayRewardsModal({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<number | null>(null)
  const [data, setData] = useState<Payouts | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const load = useCallback(async (p: number | null) => {
    setLoading(true); setError(null)
    try {
      const all = await fetchPayouts()
      // По умолчанию — самый свежий период, где есть невыплаченное
      const target = p ?? all.periods.find(x => x.hasUnpaid)?.period ?? all.periods[0]?.period ?? null
      setPeriod(target)
      const d = { ...all, rows: all.rows.filter(r => r.period === target) }
      setData(d)
      setSelected(new Set(d.rows.filter(r => !r.paid).map(r => r.dealId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setData(null)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(null) }, [load])

  const rows = data?.rows ?? []
  const groups = groupByManager(rows)
  const chosen = rows.filter(r => selected.has(r.dealId) && !r.paid)
  const toggle = (ids: number[], on: boolean) => setSelected(prev => {
    const n = new Set(prev); for (const id of ids) on ? n.add(id) : n.delete(id); return n
  })

  async function mark(ids: number[], paid: boolean, msg: string) {
    setSaving(true); setError(null)
    try {
      await setRewardsPaid(ids, paid)
      setDone(msg)
      await load(period)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  const chosenSum = chosen.reduce((s, r) => s + r.amount, 0)

  return (
    <Modal
      title="Вознаграждение выплачено"
      subtitle="Отметьте сделки, по которым рассчитались с менеджером, — в amoCRM поставится галочка «Вознаграждение выплачено»"
      onClose={onClose}
      footer={
        <>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Выбрано: <b className="text-zinc-800 dark:text-zinc-100">{deals(chosen.length)}</b>
            <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
            К выплате: <b className="text-emerald-600 dark:text-emerald-400">{fmtRub(chosenSum)}</b>
          </div>
          <button className={primaryBtn} disabled={!chosen.length || saving || loading}
            onClick={() => void mark(chosen.map(r => r.dealId), true, `Отмечено выплаченным: ${deals(chosen.length)} на ${fmtRub(chosenSum)}`)}>
            {saving ? 'Сохраняю…' : 'Отметить выплаченными'}
          </button>
        </>
      }
    >
      <div className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800/60">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Отчётный период</span>
        {data && data.periods.length > 0 && (
          <PeriodSelect
            value={period}
            options={data.periods.map(p => p.period)}
            onChange={p => { setDone(null); void load(p) }}
            mark={p => (data.periods.find(x => x.period === p)?.hasUnpaid ? ' · есть невыплаченные' : ' · всё выплачено')}
          />
        )}
      </div>

      {done && (
        <div className="mx-5 mt-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 text-sm">
          ✓ {done}
        </div>
      )}
      {error && <ErrorBox text={error} />}
      {loading && <Spinner />}

      {!loading && data && rows.length === 0 && (
        <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Начисленных вознаграждений пока нет — сначала нажмите «Начислить вознаграждение».
        </div>
      )}

      {!loading && data && rows.length > 0 && (
        <table className="w-full text-xs border-collapse mb-4">
          <tbody>
            {groups.map(g => {
              const unpaid = g.rows.filter(r => !r.paid)
              const toPay = unpaid.reduce((s, r) => s + r.amount, 0)
              const paidSum = g.rows.filter(r => r.paid).reduce((s, r) => s + r.amount, 0)
              const allOn = unpaid.length > 0 && unpaid.every(r => selected.has(r.dealId))
              return (
                <ManagerGroup key={g.id}
                  head={
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                      <td className="pl-5 pr-2 w-8 py-2">
                        {unpaid.length > 0 && (
                          <input type="checkbox" checked={allOn} onChange={e => toggle(unpaid.map(r => r.dealId), e.target.checked)} className="accent-indigo-600" />
                        )}
                      </td>
                      <td className="py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                        {g.manager} <span className="font-normal text-zinc-400">· {g.rows.length}</span>
                      </td>
                      <td className="pr-5 py-2 text-right whitespace-nowrap tabular-nums" colSpan={2}>
                        {toPay > 0 && <span className="font-semibold text-emerald-600 dark:text-emerald-400">к выплате {fmtRub(toPay)}</span>}
                        {paidSum > 0 && <span className="ml-3 text-zinc-400">выплачено {fmtRub(paidSum)}</span>}
                      </td>
                    </tr>
                  }
                >
                  {g.rows.map((r: PayoutRow) => (
                    <tr key={r.dealId} className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                      <td className="pl-5 pr-2 w-8 py-2">
                        {!r.paid && (
                          <input type="checkbox" checked={selected.has(r.dealId)} onChange={e => toggle([r.dealId], e.target.checked)} className="accent-indigo-600" />
                        )}
                      </td>
                      <td className="py-2">
                        <a href={`${data.amoUrl}/leads/detail/${r.dealId}`} target="_blank" rel="noreferrer noopener"
                          className="text-[13px] text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                          {dealTitle(r)} <span className="text-zinc-400">↗</span>
                        </a>
                        {r.inn && <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 tabular-nums">ИНН {r.inn}</div>}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {r.paid ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">✓ выплачено</span>
                            <button disabled={saving} onClick={() => void mark([r.dealId], false, `Отметка «выплачено» снята: ${dealTitle(r)}`)}
                              className="text-[10.5px] text-zinc-400 hover:text-red-500 disabled:opacity-40">снять</button>
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">не выплачено</span>
                        )}
                      </td>
                      <td className="pr-5 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{fmtRub(r.amount)}</td>
                    </tr>
                  ))}
                </ManagerGroup>
              )
            })}
          </tbody>
        </table>
      )}
    </Modal>
  )
}

// ───────────────────────── «Проверка сделок» ─────────────────────────

const REASON_INFO: Record<CheckReason, { label: string; hint: string; cls: string }> = {
  no_inn:    { label: 'нет ИНН',             hint: 'ИНН не найден ни в сделке, ни в компании — заполните, иначе не сопоставить с МегаФоном', cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
  not_found: { label: 'нет в отчётах МФ',    hint: 'Клиента с этим ИНН нет ни в одном отчёте МегаФон — проверьте, оформлен ли он на наш договор и верен ли ИНН', cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
  zero:      { label: 'начислений 0',        hint: 'Клиент есть в отчётах МегаФон, но начислений нет — номера не используются или не перенесены', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' },
}

export function DealsCheckModal({ onClose }: { onClose: () => void }) {
  const [months, setMonths] = useState(6)
  const [data, setData] = useState<DealsCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<CheckReason | 'all'>('all')

  const load = useCallback(async (m: number, refresh = false) => {
    setLoading(true); setError(null)
    try { setData(await fetchDealsCheck(m, refresh)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setData(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(months) }, [months, load])

  const all = data?.rows ?? []
  const counts = { no_inn: 0, not_found: 0, zero: 0 } as Record<CheckReason, number>
  for (const r of all) if (!r.fresh) counts[r.reason]++
  const rows = all.filter(r => reason === 'all' || r.reason === reason)
  const actual = rows.filter(r => !r.fresh)
  const fresh = rows.filter(r => r.fresh)

  const renderRows = (list: typeof rows, muted: boolean) => groupByManager(list).map(g => (
    <ManagerGroup key={g.id}
      head={
        <tr className="bg-zinc-50 dark:bg-zinc-800/50">
          <td className="pl-5 py-2 font-semibold text-zinc-700 dark:text-zinc-200" colSpan={3}>
            {g.manager} <span className="font-normal text-zinc-400">· {g.rows.length}</span>
          </td>
        </tr>
      }
    >
      {g.rows.map(r => {
        const info = REASON_INFO[r.reason]
        return (
          <tr key={r.dealId} className={`border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 ${muted ? 'opacity-60' : ''}`}>
            <td className="pl-5 py-2 align-top">
              <a href={`${data!.amoUrl}/leads/detail/${r.dealId}`} target="_blank" rel="noreferrer noopener"
                className="text-[13px] text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                {dealTitle(r)} <span className="text-zinc-400">↗</span>
              </a>
              <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                {r.inn ? `ИНН ${r.inn}` : 'ИНН не указан'}
                {r.innSource === 'name' && <span className="ml-1 text-amber-500">· по названию</span>}
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">· {muted ? 'Закрыта после последнего отчёта — дождитесь следующего' : info.hint}</span>
                {r.reason === 'zero' && <span className="ml-1">(в отчётах: {r.reportPeriods} мес.)</span>}
              </div>
            </td>
            <td className="py-2 px-3 align-top whitespace-nowrap text-zinc-500 dark:text-zinc-400">
              закрыта {fmtDate(r.closedOn)}
            </td>
            <td className="pr-5 py-2 align-top text-right">
              <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${info.cls}`}>{info.label}</span>
            </td>
          </tr>
        )
      })}
    </ManagerGroup>
  ))

  const chip = (key: CheckReason | 'all', label: string, n?: number) => (
    <button key={key} onClick={() => setReason(key)}
      className={`px-2.5 h-7 rounded-md text-xs transition-colors ${reason === key
        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
      {label}{n != null && <span className="ml-1 text-zinc-400">{n}</span>}
    </button>
  )

  return (
    <Modal
      title="Проверка сделок"
      subtitle={
        <>Успешные сделки «МегаФон Корп клиенты», по которым в отчётах МегаФон нет начислений. Выплаченные и уже начисленные не показываются.
          {data?.lastPeriod ? <> Последний загруженный отчёт — {periodTitle(data.lastPeriod).toLowerCase()}.</> : null}</>
      }
      onClose={onClose}
    >
      <div className="px-5 pt-4 pb-3 flex items-center gap-2 flex-wrap border-b border-zinc-100 dark:border-zinc-800/60">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Закрыты за</span>
        <select value={months} onChange={e => setMonths(Number(e.target.value))}
          className="h-8 px-2 rounded-lg border border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          <option value={3}>3 месяца</option>
          <option value={6}>6 месяцев</option>
          <option value={12}>12 месяцев</option>
          <option value={0}>всё время</option>
        </select>
        <div className="flex items-center gap-1 ml-2">
          {chip('all', 'Все', counts.no_inn + counts.not_found + counts.zero)}
          {chip('zero', 'Начислений 0', counts.zero)}
          {chip('not_found', 'Нет в отчётах', counts.not_found)}
          {chip('no_inn', 'Нет ИНН', counts.no_inn)}
        </div>
        <button onClick={() => void load(months, true)} disabled={loading}
          className="ml-auto px-2.5 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40">
          ↻ Обновить из amoCRM
        </button>
      </div>

      {error && <ErrorBox text={error} />}
      {loading && <Spinner />}

      {!loading && data && actual.length === 0 && fresh.length === 0 && (
        <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">Проблемных сделок нет 👍</div>
      )}

      {!loading && data && (actual.length > 0 || fresh.length > 0) && (
        <table className="w-full text-xs border-collapse mb-4">
          <tbody>
            {renderRows(actual, false)}
            {fresh.length > 0 && (
              <tr><td colSpan={3} className="px-5 pt-5 pb-2 text-xs font-semibold text-zinc-400">
                Закрыты недавно — отчёт МегаФон за их месяц ещё не загружен · {fresh.length}
              </td></tr>
            )}
            {renderRows(fresh, true)}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
