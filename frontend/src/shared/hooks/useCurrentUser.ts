import { useEffect, useState } from 'react'
import { fetchCurrentB24User, type B24User } from '../bitrix24/bx24'

let cached: B24User | null = null

export function useCurrentUser() {
  const [user, setUser] = useState<B24User | null>(cached)

  useEffect(() => {
    if (cached) return
    void fetchCurrentB24User().then((u) => {
      cached = u
      setUser(u)
    })
  }, [])

  return user
}
