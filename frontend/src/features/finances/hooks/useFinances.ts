import { useCallback, useEffect, useState } from 'react'
import {
  fetchFinancesData,
  filterFinancesData,
  syncPayments,
  type FinancesData,
} from '../api/payments'

type Direction = 'megafon' | 'crm'

export function useFinances(year: number, direction: Direction) {
  const [raw, setRaw]         = useState<FinancesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFinancesData(year)
      setRaw(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { void load() }, [load])

  const sync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      await syncPayments()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [load])

  const filtered = raw
    ? filterFinancesData(
        raw,
        direction === 'megafon' ? r => r.isMegafon : r => !r.isMegafon,
      )
    : null

  return {
    data: filtered,
    loading,
    syncing,
    error,
    reload: load,
    sync,
  }
}
