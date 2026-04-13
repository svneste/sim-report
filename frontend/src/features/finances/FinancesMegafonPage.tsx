import { useMemo, useState } from 'react'
import { useFinances } from './hooks/useFinances'
import { FinancesReport } from './FinancesReport'

export function FinancesMegafonPage() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(() => today.getFullYear())
  const { data, loading, error, reload } = useFinances(year, 'megafon')

  return (
    <FinancesReport
      title="Финансы · МегаФон"
      data={data}
      loading={loading}
      error={error}
      year={year}
      onYearChange={setYear}
      onReload={reload}
    />
  )
}
