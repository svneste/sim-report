import { useState } from 'react'
import { SimCalendarPage } from '../features/sim-calendar/SimCalendarPage'
import { LeadsReportPage } from '../features/leads-report/LeadsReportPage'
import { ThemeToggle } from '../shared/theme/ThemeToggle'

type Tab = 'sim' | 'leads'

interface TabDef {
  id:    Tab
  label: string
}

const TABS: TabDef[] = [
  { id: 'sim',   label: 'Подключения сим-карт' },
  { id: 'leads', label: 'Отчёт по заявкам' },
]

/**
 * Корневой роутинг. Простые табы — без react-router, чтобы не тащить
 * лишнюю зависимость, пока разделов всего два.
 *
 * TODO: когда появится разграничение прав, вкладку "Отчёт по заявкам"
 * нужно будет показывать только администраторам.
 */
export function App() {
  const [tab, setTab] = useState<Tab>('sim')

  return (
    <div className="min-h-full p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <nav className="flex items-center gap-1 p-1 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          {TABS.map(t => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 h-8 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </nav>
        <ThemeToggle />
      </div>

      {tab === 'sim'   && <SimCalendarPage />}
      {tab === 'leads' && <LeadsReportPage />}
    </div>
  )
}
