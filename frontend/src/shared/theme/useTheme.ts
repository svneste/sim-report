import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'theme'

function currentDomTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyDom(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
}

/**
 * Источник истины — класс `dark` на <html>.
 * Этот хук — лишь зеркало этого состояния для React, чтобы перерисовать иконку.
 * Изначальное состояние выставляется inline-скриптом в index.html (см. <head>).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'light' : currentDomTheme()
  )

  // Синхронизация: если кто-то изменил тему в другой вкладке
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        applyDom(e.newValue)
        setThemeState(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function toggle() {
    const next: Theme = currentDomTheme() === 'dark' ? 'light' : 'dark'
    applyDom(next)
    setThemeState(next)
    // eslint-disable-next-line no-console
    console.log('[theme] toggled →', next, 'html.classList:', document.documentElement.className)
  }

  function setTheme(t: Theme) {
    applyDom(t)
    setThemeState(t)
  }

  return { theme, toggle, setTheme }
}
