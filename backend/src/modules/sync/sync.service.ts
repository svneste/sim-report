import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { amocrmDeals, amocrmUsers, simRegistrations } from '../../db/schema.js'
import { amocrm, type AmoLead } from '../amocrm/client.js'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { extractSimDate } from './extract-sim-date.js'

export interface SyncResult {
  leadsUpserted: number
  usersUpserted: number
  simRowsUpserted: number
  startedAt: Date
  finishedAt: Date
}

async function upsertUsers(): Promise<number> {
  let count = 0
  const batch: { id: number; name: string; email: string | null }[] = []
  for await (const u of amocrm.users()) {
    batch.push({ id: u.id, name: u.name, email: u.email ?? null })
    count++
  }
  if (batch.length) {
    await db.insert(amocrmUsers)
      .values(batch.map(b => ({
        id:        b.id,
        name:      b.name,
        email:     b.email,
        avatarUrl: null,
        isActive:  1,
        updatedAt: new Date(),
      })))
      .onConflictDoUpdate({
        target: amocrmUsers.id,
        set: {
          name:      sql`excluded.name`,
          email:     sql`excluded.email`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }
  return count
}

async function upsertLead(lead: AmoLead): Promise<{ simDate: string | null }> {
  await db.insert(amocrmDeals)
    .values({
      id:                lead.id,
      pipelineId:        lead.pipeline_id,
      statusId:          lead.status_id,
      responsibleUserId: lead.responsible_user_id,
      name:              lead.name,
      createdAt:         lead.created_at ? new Date(lead.created_at * 1000) : null,
      updatedAt:         lead.updated_at ? new Date(lead.updated_at * 1000) : null,
      raw:               lead as unknown as object,
      syncedAt:          new Date(),
    })
    .onConflictDoUpdate({
      target: amocrmDeals.id,
      set: {
        pipelineId:        sql`excluded.pipeline_id`,
        statusId:          sql`excluded.status_id`,
        responsibleUserId: sql`excluded.responsible_user_id`,
        name:              sql`excluded.name`,
        updatedAt:         sql`excluded.updated_at`,
        raw:               sql`excluded.raw`,
        syncedAt:          sql`excluded.synced_at`,
      },
    })

  const simDate = extractSimDate(lead)
  if (simDate && lead.responsible_user_id) {
    await db.insert(simRegistrations)
      .values({
        dealId:            lead.id,
        responsibleUserId: lead.responsible_user_id,
        registeredOn:      simDate,
        syncedAt:          new Date(),
      })
      .onConflictDoUpdate({
        target: simRegistrations.dealId,
        set: {
          responsibleUserId: sql`excluded.responsible_user_id`,
          registeredOn:      sql`excluded.registered_on`,
          syncedAt:          sql`excluded.synced_at`,
        },
      })
  }
  return { simDate }
}

export const syncService = {
  /**
   * Полная или инкрементальная синхронизация.
   * @param sinceSec unix-секунды; если задано — тянем только сделки с updated_at >= sinceSec
   */
  async run(sinceSec?: number): Promise<SyncResult> {
    const startedAt = new Date()
    logger.info('sync started', { sinceSec })

    const usersUpserted = await upsertUsers()

    let leadsUpserted = 0
    let simRowsUpserted = 0
    for await (const lead of amocrm.leadsByPipeline(config.AMOCRM_PIPELINE_ID, sinceSec)) {
      const { simDate } = await upsertLead(lead)
      leadsUpserted++
      if (simDate) simRowsUpserted++
    }

    const finishedAt = new Date()
    logger.info('sync finished', { leadsUpserted, usersUpserted, simRowsUpserted })
    return { leadsUpserted, usersUpserted, simRowsUpserted, startedAt, finishedAt }
  },
}
