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
    <div className="min-h-full">
      {/* Top bar в стиле sass-сервиса: sticky, тонкая нижняя граница, минимум контраста */}
      <header className="sticky top-0 z-50 h-14 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-[1600px] mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Брендовая метка вместо логотипа — оставляем место для иконки в будущем */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
                <span className="text-[11px] font-bold text-white dark:text-zinc-900 tracking-tight">МФ</span>
              </div>
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 tracking-tight">
                МегаФон · Аналитика
              </span>
            </div>

            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />

            <nav className="flex gap-0.5">
              {TABS.map(t => {
                const active = t.id === tab
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors duration-100 ${
                      active
                        ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800'
                        : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        {tab === 'sim'   && <SimCalendarPage />}
        {tab === 'leads' && <LeadsReportPage />}
      </main>
    </div>
  )
}
