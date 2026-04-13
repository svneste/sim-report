import { useMemo, useState } from 'react'
import { useFinances } from './hooks/useFinances'
import { FinancesReport } from './FinancesReport'

export function FinancesCrmPage() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(() => today.getFullYear())
  const { data, loading, error, reload } = useFinances(year, 'crm')

  return (
    <FinancesReport
      title="Финансы · CRM-направление"
      data={data}
      loading={loading}
      error={error}
      year={year}
      onYearChange={setYear}
      onReload={reload}
    />
  )
}
