import { useMemo, useState } from 'react'
import { useFinances } from './hooks/useFinances'
import { FinancesReport } from './FinancesReport'

export function FinancesMegafonPage() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(() => today.getFullYear())
  const { data, loading, syncing, error, sync } = useFinances(year, 'megafon')

  return (
    <FinancesReport
      title="Финансы · МегаФон"
      data={data}
      loading={loading}
      syncing={syncing}
      error={error}
      year={year}
      onYearChange={setYear}
      onSync={sync}
    />
  )
}
