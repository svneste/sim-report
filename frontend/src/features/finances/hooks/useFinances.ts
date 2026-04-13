import { useCallback, useEffect, useState } from 'react'
import {
  fetchFinancesData,
  filterFinancesData,
  isMegafonCategory,
  type FinancesData,
} from '../api/payments'

type Direction = 'megafon' | 'crm'

export function useFinances(year: number, direction: Direction) {
  const [raw, setRaw]         = useState<FinancesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFinancesData(year, force)
      setRaw(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { void load() }, [load])

  const filtered = raw
    ? filterFinancesData(raw, direction === 'megafon' ? isMegafonCategory : c => !isMegafonCategory(c))
    : null

  return {
    data: filtered,
    loading,
    error,
    reload: () => load(true),
  }
}
