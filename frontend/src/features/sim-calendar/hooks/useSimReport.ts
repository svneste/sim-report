import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchSimReport, type SimReportPayload, type SimReportUser } from '../api/simReport'

export interface UseSimReportResult {
  loading:  boolean
  error:    string | null
  users:    SimReportUser[]
  /** count для (userId, dateKey YYYY-MM-DD) */
  countFor: (userId: number, dateKey: string) => number
  reload:   () => Promise<void>
}

export function useSimReport(year: number, month: number): UseSimReportResult {
  const [data, setData]       = useState<SimReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
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
    error,
    users: data?.users ?? [],
    countFor,
    reload: load,
  }
}
