import { useState } from 'react'
import { SimCalendarPage } from '../features/sim-calendar/SimCalendarPage'
import { AssociationsReportPage } from '../features/associations-report/AssociationsReportPage'
import { AssociationsYearPage } from '../features/associations-report/AssociationsYearPage'
import { FinancesMegafonPage } from '../features/finances/FinancesMegafonPage'
import { FinancesCrmPage } from '../features/finances/FinancesCrmPage'
import { ThemeToggle } from '../shared/theme/ThemeToggle'
import { Bx24Guard } from './Bx24Guard'
import { useCurrentUser } from '../shared/hooks/useCurrentUser'

type Tab = 'sim' | 'associations-day' | 'associations-year' | 'finances-megafon' | 'finances-crm'

/**
 * Корневой роутинг. Простые табы — без react-router, чтобы не тащить
 * лишнюю зависимость, пока разделов всего несколько.
 *
 * У "Заявки по объединениям" два под-отчёта, они прячутся в hover-меню
 * чтобы не захламлять верхний бар.
 *
 * TODO: когда появится разграничение прав, вкладки со статистикой
 * нужно будет показывать только администраторам.
 */
export function App() {
  const [tab, setTab] = useState<Tab>('sim')
  const [assocOpen, setAssocOpen] = useState(false)
  const [finOpen, setFinOpen] = useState(false)
  const currentUser = useCurrentUser()

  const assocActive = tab === 'associations-day' || tab === 'associations-year'
  const finActive = tab === 'finances-megafon' || tab === 'finances-crm'
  const isNesterovich = currentUser?.LAST_NAME === 'Нестерович' && currentUser?.NAME === 'Сергей'

  return (
    <Bx24Guard>
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

            <nav className="flex gap-0.5 items-center">
              {/* Подключения сим-карт — обычная вкладка */}
              <button
                type="button"
                onClick={() => setTab('sim')}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors duration-100 ${
                  tab === 'sim'
                    ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Подключения сим-карт
              </button>

              {/* Заявки по объединениям — hover-меню с двумя подпунктами */}
              <div
                className="relative"
                onMouseEnter={() => setAssocOpen(true)}
                onMouseLeave={() => setAssocOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setTab('associations-day')}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors duration-100 flex items-center gap-1 ${
                    assocActive
                      ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Заявки по объединениям
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="opacity-60">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {assocOpen && (
                  <div
                    className="absolute left-0 top-full pt-1 min-w-[220px]"
                    // Запас сверху (pt-1) — мост между кнопкой и меню, чтобы
                    // курсор не попадал в "дырку" и меню не закрывалось.
                  >
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden py-1">
                      <button
                        type="button"
                        onClick={() => { setTab('associations-day'); setAssocOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          tab === 'associations-day'
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        Подключения по дням
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTab('associations-year'); setAssocOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          tab === 'associations-year'
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        Подключения по месяцам
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Финансы — только для Нестерович Сергея */}
              {isNesterovich && (
                <div
                  className="relative"
                  onMouseEnter={() => setFinOpen(true)}
                  onMouseLeave={() => setFinOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setTab('finances-megafon')}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors duration-100 flex items-center gap-1 ${
                      finActive
                        ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800'
                        : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    Финансы
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="opacity-60">
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {finOpen && (
                    <div className="absolute left-0 top-full pt-1 min-w-[220px]">
                      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden py-1">
                        <button
                          type="button"
                          onClick={() => { setTab('finances-megafon'); setFinOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            tab === 'finances-megafon'
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          МегаФон
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTab('finances-crm'); setFinOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            tab === 'finances-crm'
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          CRM-направление
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </nav>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        {tab === 'sim'               && <SimCalendarPage />}
        {tab === 'associations-day'  && <AssociationsReportPage />}
        {tab === 'associations-year' && <AssociationsYearPage />}
        {tab === 'finances-megafon'  && <FinancesMegafonPage />}
        {tab === 'finances-crm'      && <FinancesCrmPage />}
      </main>
    </div>
    </Bx24Guard>
  )
}
