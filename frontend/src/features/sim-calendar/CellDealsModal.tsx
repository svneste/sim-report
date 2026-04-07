import { useEffect, useState } from 'react'
import { fetchDealsForCell, type SimReportDeal } from './api/simReport'

export interface CellDealsModalProps {
  userId:   number
  userName: string
  date:     string // YYYY-MM-DD
  dateLabel: string // человекочитаемое
  onClose:  () => void
}

/**
 * Модальное окно со списком сделок для конкретной ячейки календаря.
 * Грузит данные при монтировании, закрывается по Esc / клику на оверлей.
 */
export function CellDealsModal({ userId, userName, date, dateLabel, onClose }: CellDealsModalProps) {
  const [deals, setDeals]     = useState<SimReportDeal[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDealsForCell(userId, date)
      .then(r => { if (!cancelled) setDeals(r.deals) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, date])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{userName}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {dateLabel}
              {deals && ` • ${deals.length} ${pluralDeals(deals.length)}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors"
            aria-label="Закрыть"
          >✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</div>
          )}

          {error && (
            <div className="m-5 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && deals && deals.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Нет сделок</div>
          )}

          {!loading && !error && deals && deals.length > 0 && (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {deals.map(d => (
                <li key={d.id} className="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                        {d.name || `Сделка #${d.id}`}
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600 shrink-0">#{d.id} ↗</span>
                    </div>
                    {d.association && (
                      <div className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-400">
                        <span className="text-zinc-400 dark:text-zinc-500">Объединение: </span>
                        {d.association}
                      </div>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function pluralDeals(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'сделок'
  if (mod10 === 1) return 'сделка'
  if (mod10 >= 2 && mod10 <= 4) return 'сделки'
  return 'сделок'
}
