import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmUsers } from '../../db/schema.js'
import { logger } from '../../core/logger.js'

/**
 * Юзер, прилетающий с фронта через BX24.callMethod('user.get').
 * Поля назваеся как в Bitrix24 REST (UPPER_CASE) — фронт ничего
 * не переименовывает, чтобы было видно "это сырой формат B24".
 */
export interface B24UserInput {
  ID:            string | number
  NAME?:         string | null
  LAST_NAME?:    string | null
  SECOND_NAME?:  string | null
  PERSONAL_PHOTO?: string | null
}

/**
 * Нормализует ФИО для сопоставления:
 * - lower-case
 * - ё → е
 * - убирает всё, кроме букв и пробелов
 * - сжимает повторяющиеся пробелы
 *
 * Этого достаточно для совпадения "Иванов И.И." с "ИВАНОВ И.И.",
 * "Иван Петров" с "иван  петров" и "Артём" с "Артем".
 */
function normalizeName(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Из B24-юзера строим набор кандидатов для матчинга по имени.
 * amoCRM хранит ФИО одной строкой и порядок может быть любой
 * (Имя Фамилия / Фамилия Имя / Фамилия Имя Отчество), поэтому
 * генерим все разумные перестановки.
 */
function candidatesFor(u: B24UserInput): string[] {
  const first  = normalizeName(u.NAME)
  const last   = normalizeName(u.LAST_NAME)
  const second = normalizeName(u.SECOND_NAME)

  const out = new Set<string>()
  if (first && last) {
    out.add(`${first} ${last}`)
    out.add(`${last} ${first}`)
    if (second) {
      out.add(`${first} ${second} ${last}`)
      out.add(`${last} ${first} ${second}`)
    }
  } else if (first) {
    out.add(first)
  } else if (last) {
    out.add(last)
  }
  return [...out]
}

export interface AvatarSyncResult {
  receivedB24Users: number
  matched:          number
  updated:          number
  /** ФИО, которые не нашлись в amocrm_users — для дебага */
  unmatchedAmocrm:  string[]
}

export const bitrix24UsersService = {
  async syncAvatars(input: B24UserInput[]): Promise<AvatarSyncResult> {
    // Карта нормализованное_имя → URL фото
    const photoByName = new Map<string, string>()
    for (const u of input) {
      const photo = (u.PERSONAL_PHOTO ?? '').trim()
      if (!photo) continue
      for (const c of candidatesFor(u)) {
        // если на одно имя приходится несколько B24-юзеров с фото —
        // оставляем первый, последующие игнорим (логируем коллизию)
        if (photoByName.has(c)) {
          logger.warn('avatar match collision', { name: c })
          continue
        }
        photoByName.set(c, photo)
      }
    }

    if (!photoByName.size) {
      return { receivedB24Users: input.length, matched: 0, updated: 0, unmatchedAmocrm: [] }
    }

    const amoUsers = await db.select({
      id:   amocrmUsers.id,
      name: amocrmUsers.name,
    }).from(amocrmUsers)

    let matched = 0
    let updated = 0
    const unmatched: string[] = []

    for (const u of amoUsers) {
      const key = normalizeName(u.name)
      const photo = photoByName.get(key)
      if (!photo) {
        unmatched.push(u.name)
        continue
      }
      matched++
      const res = await db.execute(sql`
        update ${amocrmUsers}
        set avatar_url = ${photo}, updated_at = now()
        where id = ${u.id}
      `)
      const c = (res as unknown as { count?: number }).count ?? 0
      updated += c
    }

    logger.info('b24 avatars sync done', {
      receivedB24Users: input.length,
      matched,
      updated,
      unmatchedCount: unmatched.length,
    })

    return {
      receivedB24Users: input.length,
      matched,
      updated,
      unmatchedAmocrm: unmatched,
    }
  },
}
