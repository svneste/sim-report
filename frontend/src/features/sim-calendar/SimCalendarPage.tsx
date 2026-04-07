import { useMemo, useState } from 'react'
import { useSimReport } from './hooks/useSimReport'
import { CellDealsModal } from './CellDealsModal'
import {
  DAY_NAMES_SHORT,
  MONTH_NAMES_NOM,
  dateKey,
  dayOfWeekMon0,
  daysInMonth,
} from '../../shared/lib/date'

interface OpenedCell {
  userId:    number
  userName:  string
  date:      string
  dateLabel: string
}

function getInitials(name: string): string {
  const p = name.trim().split(' ')
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()
}

export function SimCalendarPage() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const year   = view.getFullYear()
  const month0 = view.getMonth()
  const month1 = month0 + 1

  const { loading, error, users, countFor, reload } = useSimReport(year, month1)

  const [openedCell, setOpenedCell] = useState<OpenedCell | null>(null)

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month1) }, (_, i) => i + 1),
    [year, month1],
  )

  const isWeekend = (d: number) => dayOfWeekMon0(year, month0, d) >= 5
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month0 && today.getDate() === d

  const cell = (uid: number, d: number) => countFor(uid, dateKey(year, month1, d))

  const dayTotals = useMemo(() => {
    const t: Record<number, number> = {}
    for (const d of days) t[d] = users.reduce((s, u) => s + cell(u.id, d), 0)
    return t
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, users, countFor])

  const userTotals = useMemo(() => {
    const t: Record<number, number> = {}
    for (const u of users) t[u.id] = days.reduce((s, d) => s + cell(u.id, d), 0)
    return t
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, users, countFor])

  const grandTotal = Object.values(dayTotals).reduce((a, b) => a + b, 0)

  const monthLabel = `${MONTH_NAMES_NOM[month0]} ${year}`

  function prev() { setView(new Date(year, month0 - 1, 1)) }
  function next() { setView(new Date(year, month0 + 1, 1)) }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">Календарь оформлений сим-карт</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >‹</button>
          <div className="min-w-[160px] text-center text-sm font-semibold">
            {monthLabel}{loading && ' …'}
          </div>
          <button
            onClick={next}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >›</button>
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="ml-2 px-3 h-8 rounded-lg border border-zinc-200 bg-white text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >
            Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  style={{ width: 220, minWidth: 220, height: 48 }}
                >
                  Сотрудник
                </th>
                {days.map(d => (
                  <th
                    key={d}
                    className={`border-b border-l border-zinc-200 dark:border-zinc-800 p-0 text-center ${
                      isWeekend(d)
                        ? 'bg-zinc-100/60 dark:bg-zinc-800/40'
                        : 'bg-zinc-50 dark:bg-zinc-900'
                    }`}
                    style={{ width: 42, minWidth: 42 }}
                  >
                    <div className="flex flex-col items-center justify-center gap-0.5 py-1.5">
                      <span
                        className={`text-[11px] leading-none font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday(d)
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : isWeekend(d)
                              ? 'text-zinc-400 dark:text-zinc-500'
                              : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                      >{d}</span>
                      <span className={`text-[9px] leading-none uppercase tracking-wide ${
                        isWeekend(d)
                          ? 'text-zinc-400 dark:text-zinc-600'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}>
                        {DAY_NAMES_SHORT[dayOfWeekMon0(year, month0, d)]}
                      </span>
                    </div>
                  </th>
                ))}
                <th
                  className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  style={{ width: 64, minWidth: 64 }}
                >
                  Итого
                </th>
              </tr>
            </thead>

            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 px-3">
                    <div className="flex items-center gap-2.5 h-[36px]">
                      <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                      <div className="h-2.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                    </div>
                  </td>
                  {days.map(d => (
                    <td key={d} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${isWeekend(d) ? 'bg-zinc-100/40 dark:bg-zinc-800/30' : ''}`}>
                      <div className="h-[36px]" />
                    </td>
                  ))}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100/40 dark:bg-zinc-800/30"><div className="h-[36px]" /></td>
                </tr>
              ))}

              {!loading && users.map(u => (
                <tr key={u.id} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-3 transition-colors">
                    <div className="flex items-center gap-2.5 h-[36px]">
                      {u.avatar
                        ? <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                        : (
                          <div className="w-6 h-6 rounded-full bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 text-[9px] font-bold flex items-center justify-center select-none">
                            {getInitials(u.name)}
                          </div>
                        )}
                      <span className="text-[13px] truncate text-zinc-900 dark:text-zinc-100" style={{ maxWidth: 156 }}>{u.name}</span>
                    </div>
                  </td>
                  {days.map(d => {
                    const c = cell(u.id, d)
                    const dk = dateKey(year, month1, d)
                    return (
                      <td key={d} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${isWeekend(d) ? 'bg-zinc-100/40 dark:bg-zinc-800/30' : ''}`}>
                        {c > 0 ? (
                          <button
                            type="button"
                            onClick={() => setOpenedCell({
                              userId:    u.id,
                              userName:  u.name,
                              date:      dk,
                              dateLabel: `${d} ${MONTH_NAMES_NOM[month0].toLowerCase()} ${year}`,
                            })}
                            className="w-full h-[36px] flex items-center justify-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 cursor-pointer hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20 dark:hover:bg-emerald-500/20 transition-colors"
                            title={`${u.name}: ${c} шт. — нажмите, чтобы посмотреть сделки`}
                          >
                            {c}
                          </button>
                        ) : (
                          <div className="w-full h-[36px]" />
                        )}
                      </td>
                    )
                  })}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0">
                    <div className={`h-[36px] flex items-center justify-center text-[12px] font-semibold px-2 ${
                      (userTotals[u.id] ?? 0) > 0
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-300 dark:text-zinc-700'
                    }`}>
                      {userTotals[u.id] > 0 ? userTotals[u.id] : '—'}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={days.length + 2} className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Нет данных за этот месяц
                  </td>
                </tr>
              )}

              {!loading && users.length > 0 && (
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                  <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                    <div className="h-[36px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                  </td>
                  {days.map(d => (
                    <td key={d} className={`border-l border-zinc-200 dark:border-zinc-800 p-0 ${isWeekend(d) ? 'bg-zinc-100/60 dark:bg-zinc-800/40' : ''}`}>
                      <div className={`h-[36px] flex items-center justify-center text-[11px] font-semibold ${
                        (dayTotals[d] ?? 0) > 0
                          ? 'text-zinc-900 dark:text-zinc-100'
                          : 'text-transparent'
                      }`}>
                        {dayTotals[d] > 0 ? dayTotals[d] : '0'}
                      </div>
                    </td>
                  ))}
                  <td className="border-l border-zinc-200 dark:border-zinc-800 p-0 bg-zinc-100 dark:bg-zinc-800/60">
                    <div className="h-[36px] flex items-center justify-center text-[12px] font-bold px-2 text-zinc-900 dark:text-zinc-100">
                      {grandTotal > 0 ? grandTotal : '—'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openedCell && (
        <CellDealsModal
          userId={openedCell.userId}
          userName={openedCell.userName}
          date={openedCell.date}
          dateLabel={openedCell.dateLabel}
          onClose={() => setOpenedCell(null)}
        />
      )}
    </div>
  )
}
