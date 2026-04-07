import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssociationOption } from './api/associationsReport'

interface Props {
  options:    AssociationOption[]
  selected:   Set<string>
  onChange:   (next: Set<string>) => void
  disabled?:  boolean
}

/**
 * Фильтр объединений: кнопка с количеством выбранных, при клике —
 * popover со строкой поиска и чекбоксами. Список приходит готовый
 * (allOptions из payload), отсортированный по убыванию total.
 */
export function AssociationFilter({ options, selected, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Закрытие при клике вне попапа / Esc
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.name.toLowerCase().includes(q))
  }, [options, query])

  function toggle(name: string) {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange(next)
  }

  function clearAll() {
    onChange(new Set())
  }

  const count = selected.size
  const buttonLabel = count === 0
    ? 'Все объединения'
    : `Выбрано: ${count}`

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 h-8 rounded-lg border text-sm transition-colors disabled:opacity-40 ${
          count > 0
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm2 5a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm3 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        {buttonLabel}
        {count > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); clearAll() }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); clearAll() } }}
            className="ml-1 -mr-1 w-4 h-4 flex items-center justify-center rounded hover:bg-emerald-200/60 dark:hover:bg-emerald-500/30 cursor-pointer"
            title="Очистить фильтр"
          >×</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[340px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск объединения…"
              className="w-full h-8 px-2.5 rounded-md text-sm border border-zinc-200 bg-zinc-50 outline-none focus:bg-white focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:bg-zinc-900 dark:focus:border-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Ничего не найдено
              </div>
            ) : (
              filtered.map(opt => {
                const checked = selected.has(opt.name)
                return (
                  <label
                    key={opt.name}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.name)}
                      className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200" title={opt.name}>
                      {opt.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      {opt.total}
                    </span>
                  </label>
                )
              })
            )}
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 px-2 py-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={clearAll}
              disabled={count === 0}
              className="px-2 h-7 rounded-md text-[12px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              Сбросить
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 h-7 rounded-md text-[12px] font-medium text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
