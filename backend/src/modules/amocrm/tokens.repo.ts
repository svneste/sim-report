import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmTokens } from '../../db/schema.js'

export interface StoredTokens {
  accessToken:  string
  refreshToken: string
  expiresAt:    Date
}

export const tokensRepo = {
  async get(subdomain: string): Promise<StoredTokens | null> {
    const rows = await db.select().from(amocrmTokens).where(eq(amocrmTokens.subdomain, subdomain)).limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      accessToken:  row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt:    row.expiresAt,
    }
  },

  async save(subdomain: string, t: StoredTokens): Promise<void> {
    await db.insert(amocrmTokens)
      .values({
        subdomain,
        accessToken:  t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt:    t.expiresAt,
        updatedAt:    new Date(),
      })
      .onConflictDoUpdate({
        target: amocrmTokens.subdomain,
        set: {
          accessToken:  t.accessToken,
          refreshToken: t.refreshToken,
          expiresAt:    t.expiresAt,
          updatedAt:    new Date(),
        },
      })
  },
}
