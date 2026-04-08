import { useEffect, useState } from 'react'
import { fetchIncomingDeals, type IncomingDealsPayload } from '../api/simReport'

/**
 * Тянет данные для второго графика — динамика поступивших заявок по дням.
 * `reloadKey` инвалидирует запрос: при клике на "Обновить" в SimCalendarPage
 * родитель инкрементирует ключ и хук перетягивает свежие данные после
 * того, как amoCRM-sync уже отработал.
 */
export function useIncomingDeals(year: number, month: number, reloadKey: number) {
  const [data, setData]       = useState<IncomingDealsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchIncomingDeals(year, month)
      .then(p => { if (!cancelled) setData(p) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month, reloadKey])

  return {
    loading,
    error,
    users:       data?.users       ?? [],
    entries:     data?.entries     ?? [],
    prevEntries: data?.prevEntries ?? [],
    prevMonth:   data?.prevMonth   ?? null,
  }
}
