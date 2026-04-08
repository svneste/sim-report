import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchSimReport, pushBitrixAvatars, runSync, type SimReportEntry, type SimReportPayload, type SimReportUser } from '../api/simReport'
import { fetchB24Users, isBitrix24Available } from '../../../shared/bitrix24/bx24'

export interface UseSimReportResult {
  loading:  boolean
  syncing:  boolean
  error:    string | null
  users:    SimReportUser[]
  /** count для (userId, dateKey YYYY-MM-DD) */
  countFor: (userId: number, dateKey: string) => number
  /** Просто перечитать отчёт из БД (быстро). */
  reload:   () => Promise<void>
  /** Триггернуть sync с amoCRM, затем перечитать (медленнее, для кнопки "Обновить"). */
  refresh:  () => Promise<void>
  /** Сырые агрегаты для графика. */
  dayTotals:          Record<number, number>
  prevMonthDayTotals: Record<number, number>
  prevMonthMeta:      { year: number; month: number; daysInMonth: number } | null
  /** Per-user per-day записи — нужны для фильтра по сотрудникам на графике. */
  entries:            SimReportEntry[]
  prevEntries:        SimReportEntry[]
}

export function useSimReport(year: number, month: number): UseSimReportResult {
  const [data, setData]       = useState<SimReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchSimReport(year, month)
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  /**
   * Полный цикл: sync с amoCRM (инкрементальный, последние 6ч) → перечитать отчёт.
   * Используется кнопкой "Обновить", чтобы юзер видел актуальные данные.
   *
   * Дополнительно — если SPA открыта внутри iframe Bitrix24 (BX24.js доступен) —
   * подтягиваем фотки сотрудников из B24 и сопоставляем их с amocrm_users по ФИО.
   * Делаем это параллельно с amoCRM-sync, чтобы не удлинять Spinner.
   * Ошибка в B24-ветке не должна валить основной refresh.
   */
  const refresh = useCallback(async () => {
    setSyncing(true)
    setError(null)

    const amoSync = runSync(6)
    const b24Sync = (async () => {
      try {
        if (!(await isBitrix24Available())) return
        const users = await fetchB24Users()
        if (!users.length) return
        await pushBitrixAvatars(users as unknown as Array<Record<string, unknown>>)
      } catch (e) {
        // не критично — отчёт всё равно построится, просто без новых аватарок
        console.warn('[sim-report] bitrix24 avatars sync failed', e)
      }
    })()

    try {
      await amoSync
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSyncing(false)
      return
    }
    await b24Sync
    setSyncing(false)
    await load()
  }, [load])

  useEffect(() => { void load() }, [load])

  const index = useMemo(() => {
    const map = new Map<string, number>()
    if (!data) return map
    for (const e of data.entries) {
      map.set(`${e.userId}:${e.date}`, e.count)
    }
    return map
  }, [data])

  const countFor = useCallback(
    (userId: number, dateKey: string) => index.get(`${userId}:${dateKey}`) ?? 0,
    [index],
  )

  return {
    loading,
    syncing,
    error,
    users: data?.users ?? [],
    countFor,
    reload: load,
    refresh,
    dayTotals:          data?.dayTotals          ?? {},
    prevMonthDayTotals: data?.prevMonthDayTotals ?? {},
    prevMonthMeta:      data?.prevMonth          ?? null,
    entries:            data?.entries            ?? [],
    prevEntries:        data?.prevEntries        ?? [],
  }
}
