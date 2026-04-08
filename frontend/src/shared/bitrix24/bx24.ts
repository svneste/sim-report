/**
 * Тонкая обёртка над BX24.js — официальным JS-API Bitrix24.
 *
 * BX24 живёт только когда наша SPA открыта внутри iframe локального
 * приложения B24. Он сам разруливает OAuth-handshake (Bitrix24 кладёт
 * AUTH_ID в POST-форму при первом открытии handler URL, а скрипт
 * api.bitrix24.com/api/v1/ их подхватывает) — нам не нужно ни хранить
 * токены, ни делать refresh.
 *
 * Если SPA открыли вне B24 (dev, прямой URL) — `isAvailable()` вернёт
 * false и вся ветка с аватарками просто пропустится.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface B24User {
  ID:             string
  NAME?:          string | null
  LAST_NAME?:     string | null
  SECOND_NAME?:   string | null
  PERSONAL_PHOTO?: string | null
}

interface B24CallResult {
  data:  () => unknown
  error: () => unknown
  total: () => number
  next:  () => Promise<B24CallResult> | null
}

interface B24Auth {
  access_token:  string
  refresh_token: string
  domain:        string
  member_id:     string
  expires_in:    number
  expires:       number
  status:        string
}

interface B24Global {
  init:       (cb: () => void) => void
  callMethod: (
    method: string,
    params: Record<string, unknown>,
    cb:     (result: B24CallResult) => void,
  ) => void
  getAuth:    () => B24Auth | false
  refreshAuth?: (cb: (auth: B24Auth | false) => void) => void
}

declare global {
  interface Window {
    BX24?: B24Global
  }
}

/**
 * Резолвится, когда BX24.init() отработал. Если BX24 не загрузился
 * за `timeoutMs` — резолвится в false (мы не в B24).
 */
function waitForBx24(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      if (window.BX24 && typeof window.BX24.init === 'function') {
        try {
          window.BX24.init(() => resolve(true))
        } catch {
          resolve(false)
        }
        return
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false)
        return
      }
      setTimeout(tick, 50)
    }
    tick()
  })
}

export async function isBitrix24Available(): Promise<boolean> {
  return waitForBx24()
}

/**
 * Возвращает текущий access_token из BX24.js. BX24 сам кладёт его при
 * init и сам рефрешит при истечении, так что вызов синхронный — мы
 * просто читаем актуальное значение.
 *
 * Если SPA открыта вне B24 (BX24 не поднялся) — вернёт null, и http-клиент
 * не добавит Authorization-заголовок (бэк ответит 401, что и нужно).
 */
export function getB24Token(): string | null {
  if (typeof window === 'undefined' || !window.BX24) return null
  try {
    const auth = window.BX24.getAuth()
    if (auth && typeof auth.access_token === 'string' && auth.access_token) {
      return auth.access_token
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Тянет всех пользователей B24 через user.get с пагинацией.
 * Bitrix24 отдаёт по 50 за раз, итерируем через result.next().
 *
 * Параметры запроса:
 *  - ACTIVE = true     — только активные сотрудники
 *  - USER_TYPE = employee — без extranet и интегрированных юзеров
 */
export async function fetchB24Users(): Promise<B24User[]> {
  const ok = await waitForBx24()
  if (!ok || !window.BX24) return []

  const bx24 = window.BX24
  const all: B24User[] = []

  return new Promise((resolve, reject) => {
    const handle = (res: B24CallResult) => {
      const err = res.error()
      if (err) {
        reject(new Error(`BX24 user.get failed: ${JSON.stringify(err)}`))
        return
      }
      const chunk = res.data() as B24User[] | null
      if (Array.isArray(chunk)) all.push(...chunk)

      const more = res.next()
      if (more && typeof (more as any).then === 'function') {
        ;(more as Promise<B24CallResult>).then(handle).catch(reject)
      } else {
        resolve(all)
      }
    }

    bx24.callMethod(
      'user.get',
      { ACTIVE: true, USER_TYPE: 'employee' },
      handle,
    )
  })
}
