import { SimCalendarPage } from '../features/sim-calendar/SimCalendarPage'
import { ThemeToggle } from '../shared/theme/ThemeToggle'

/**
 * Корневой роутинг. Сейчас одна фича — календарь sim-карт.
 * Новые фичи добавляются здесь как соседние страницы (можно подключить react-router позже).
 */
export function App() {
  return (
    <div className="min-h-full p-6 max-w-[1600px] mx-auto">
      <div className="flex justify-end mb-3">
        <ThemeToggle />
      </div>
      <SimCalendarPage />
    </div>
  )
}
