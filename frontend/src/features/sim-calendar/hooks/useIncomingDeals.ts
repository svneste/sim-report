import { useEffect, useState } from 'react'
import { fetchActivatedDeals, fetchIncomingDeals, fetchSuccessfulDeals, type IncomingDealsPayload } from '../api/simReport'

type Fetcher = (year: number, month: number) => Promise<IncomingDealsPayload>

/**
 * Базовый хук для графиков, отдающих IncomingDealsPayload-shape.
 * Принимает fetcher, чтобы один и тот же стейт-менеджмент использовался
 * для "поступивших" и "успешных" — отличается только URL ручки.
 *
 * `reloadKey` инвалидирует запрос: при клике на "Обновить" в SimCalendarPage
 * родитель инкрементирует ключ и хук перетягивает свежие данные после
 * того, как amoCRM-sync уже отработал.
 */
function useDealsPayload(fetcher: Fetcher, year: number, month: number, reloadKey: number) {
  const [data, setData]       = useState<IncomingDealsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcher(year, month)
      .then(p => { if (!cancelled) setData(p) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetcher, year, month, reloadKey])

  return {
    loading,
    error,
    users:       data?.users       ?? [],
    entries:     data?.entries     ?? [],
    prevEntries: data?.prevEntries ?? [],
    prevMonth:   data?.prevMonth   ?? null,
  }
}

export function useIncomingDeals(year: number, month: number, reloadKey: number) {
  return useDealsPayload(fetchIncomingDeals, year, month, reloadKey)
}

export function useSuccessfulDeals(year: number, month: number, reloadKey: number) {
  return useDealsPayload(fetchSuccessfulDeals, year, month, reloadKey)
}

export function useActivatedDeals(year: number, month: number, reloadKey: number) {
  return useDealsPayload(fetchActivatedDeals, year, month, reloadKey)
}
