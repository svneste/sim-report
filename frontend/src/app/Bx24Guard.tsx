import { useEffect, useState, type ReactNode } from 'react'
import { isBitrix24Available } from '../shared/bitrix24/bx24'

type State = 'checking' | 'allowed' | 'blocked'

/**
 * Гард, который пускает пользователя в приложение только если страница
 * открыта в iframe Bitrix24 локального приложения.
 *
 * Алгоритм:
 * 1. Если SPA НЕ в iframe (`window.top === window.self`) — сразу блок,
 *    нет смысла даже ждать BX24.
 * 2. Если в iframe — даём BX24.js до 1.5 сек на инициализацию (он может
 *    подняться только когда родитель — реально портал B24 и прислал
 *    нужный POST-handshake). Получилось — пускаем, нет — блокируем.
 *
 * Это клиентская защита: SPA-файлы по-прежнему отдаются всем
 * (того требует сам Bitrix24, который POST'ом грузит handler URL),
 * но React просто не рендерит контент отчёта вне B24.
 */
export function Bx24Guard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    let cancelled = false

    // Шаг 1: проверка iframe — синхронная, мгновенная.
    // window.top может бросить SecurityError при cross-origin — это как
    // раз признак, что мы в iframe чужого домена (B24), значит OK.
    let inIframe = false
    try {
      inIframe = window.top !== window.self
    } catch {
      inIframe = true
    }

    if (!inIframe) {
      setState('blocked')
      return
    }

    // Шаг 2: ждём, что BX24.js поднимется (значит родительский фрейм —
    // действительно портал Bitrix24, а не случайный сайт).
    void isBitrix24Available().then((ok) => {
      if (cancelled) return
      setState(ok ? 'allowed' : 'blocked')
    })

    return () => { cancelled = true }
  }, [])

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Проверка доступа…
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 5-9" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Доступ только из Bitrix24
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Этот отчёт открывается из левого меню портала
            <span className="whitespace-nowrap"> melabs.bitrix24.ru</span>.
            Прямая ссылка не работает — это сделано специально, чтобы
            данные были доступны только сотрудникам компании.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
