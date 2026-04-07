import { and, asc, between, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmUsers, simRegistrations } from '../../db/schema.js'
import { config } from '../../core/config.js'

export interface SimReportUser {
  id:     number
  name:   string
  email:  string | null
  avatar: string | null
}

export interface SimReportEntry {
  userId: number
  date:   string // YYYY-MM-DD
  count:  number
}

export interface SimReportPayload {
  year:    number
  month:   number // 1..12
  users:   SimReportUser[]
  entries: SimReportEntry[]
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  // последний день месяца
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

export const simReportService = {
  /**
   * Возвращает данные для построения календаря: список сотрудников + агрегаты по дням.
   * Доменный модуль не знает про amoCRM API — читает из локальной БД.
   */
  async getMonthly(year: number, month: number): Promise<SimReportPayload> {
    const { from, to } = monthRange(year, month)

    const excluded = config.reportExcludedUserIds
    const dateFilter = between(simRegistrations.registeredOn, from, to)
    const whereClause = excluded.length
      ? and(dateFilter, notInArray(simRegistrations.responsibleUserId, excluded))
      : dateFilter

    const rows = await db
      .select({
        userId: simRegistrations.responsibleUserId,
        date:   simRegistrations.registeredOn,
        count:  sql<number>`count(*)::int`,
      })
      .from(simRegistrations)
      .where(whereClause)
      .groupBy(simRegistrations.responsibleUserId, simRegistrations.registeredOn)
      .orderBy(asc(simRegistrations.registeredOn))

    const entries: SimReportEntry[] = rows.map(r => ({
      userId: Number(r.userId),
      date:   String(r.date),
      count:  Number(r.count),
    }))

    const userIds = Array.from(new Set(entries.map(e => e.userId)))
    const usersData = userIds.length
      ? await db.select().from(amocrmUsers).where(inArray(amocrmUsers.id, userIds))
      : []

    const users: SimReportUser[] = usersData
      .map(u => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    return { year, month, users, entries }
  },
}

void sql; void inArray
