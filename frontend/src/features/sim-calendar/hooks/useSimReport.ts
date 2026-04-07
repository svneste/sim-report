import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchSimReport, runSync, type SimReportPayload, type SimReportUser } from '../api/simReport'

export interface UseSimReportResult {
  loading:  boolean
  syncing:  boolean
  error:    string | null
  users:    SimReportUser[]
  /** count для (userId, dateKey YYYY-MM-DD) */
  countFor: (userId: number, dateKey: string) => number
  /** Просто перечитать отчёт из БД (быстро). */
  reload:   () => Promise<void>
  /** Триггернуть sync с amoCRM, затем перечитать (медленнее, для кнопки "Обновить"). */
  refresh:  () => Promise<void>
}

export function useSimReport(year: number, month: number): UseSimReportResult {
  const [data, setData]       = useState<SimReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchSimReport(year, month)
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  /**
   * Полный цикл: sync с amoCRM (инкрементальный, последние 6ч) → перечитать отчёт.
   * Используется кнопкой "Обновить", чтобы юзер видел актуальные данные.
   */
  const refresh = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      await runSync(6)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSyncing(false)
      return
    }
    setSyncing(false)
    await load()
  }, [load])

  useEffect(() => { void load() }, [load])

  const index = useMemo(() => {
    const map = new Map<string, number>()
    if (!data) return map
    for (const e of data.entries) {
      map.set(`${e.userId}:${e.date}`, e.count)
    }
    return map
  }, [data])

  const countFor = useCallback(
    (userId: number, dateKey: string) => index.get(`${userId}:${dateKey}`) ?? 0,
    [index],
  )

  return {
    loading,
    syncing,
    error,
    users: data?.users ?? [],
    countFor,
    reload: load,
    refresh,
  }
}
