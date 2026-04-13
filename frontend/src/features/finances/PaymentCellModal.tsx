import { useEffect, useState } from 'react'
import { fetchCellPayments, type PaymentItem } from './api/payments'

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const fmt = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })

function pluralPayments(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'платежей'
  if (mod10 === 1) return 'платёж'
  if (mod10 >= 2 && mod10 <= 4) return 'платежа'
  return 'платежей'
}

export interface PaymentCellModalProps {
  category: string
  type:     'income' | 'expense'
  year:     number
  month:    number
  onClose:  () => void
}

export function PaymentCellModal({ category, type, year, month, onClose }: PaymentCellModalProps) {
  const [items, setItems]     = useState<PaymentItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCellPayments(category, type, year, month)
      .then(r => { if (!cancelled) setItems(r.items) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [category, type, year, month])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const typeLabel = type === 'income' ? 'Поступления' : 'Затраты'

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
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{category}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {typeLabel} · {MONTH_NAMES[month - 1]} {year}
              {items && ` · ${items.length} ${pluralPayments(items.length)}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400 transition-colors"
            aria-label="Закрыть"
          >
            &#x2715;
          </button>
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

          {!loading && !error && items && items.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Нет платежей</div>
          )}

          {!loading && !error && items && items.length > 0 && (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map(p => (
                <li key={p.id} className="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                        {p.title || `Платёж #${p.id}`}
                      </div>
                      <span className={`text-[13px] font-semibold shrink-0 ${
                        type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-500 dark:text-red-400'
                      }`}>
                        {fmt(p.amount)} &#8381;
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                      <span>{p.date}</span>
                      <span>#{p.id} &#x2197;</span>
                    </div>
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
