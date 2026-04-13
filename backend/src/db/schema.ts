import {
  pgTable,
  bigint,
  text,
  timestamp,
  integer,
  jsonb,
  date,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core'

/**
 * Хранилище OAuth2-токенов amoCRM. Одна запись на аккаунт (subdomain).
 * Хранится отдельно, чтобы модуль amocrm не зависел от других таблиц.
 */
export const amocrmTokens = pgTable('amocrm_tokens', {
  subdomain:    text('subdomain').primaryKey(),
  accessToken:  text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Сотрудники amoCRM (responsible_user_id у сделок).
 */
export const amocrmUsers = pgTable('amocrm_users', {
  id:        bigint('id', { mode: 'number' }).primaryKey(),
  name:      text('name').notNull(),
  email:     text('email'),
  avatarUrl: text('avatar_url'),
  isActive:  integer('is_active').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Сырые сделки amoCRM. Только то, что нужно для отчётов; raw — полный payload на будущее.
 */
export const amocrmDeals = pgTable('amocrm_deals', {
  id:                bigint('id', { mode: 'number' }).primaryKey(),
  pipelineId:        bigint('pipeline_id', { mode: 'number' }).notNull(),
  statusId:          bigint('status_id', { mode: 'number' }),
  responsibleUserId: bigint('responsible_user_id', { mode: 'number' }),
  name:              text('name'),
  createdAt:         timestamp('created_at', { withTimezone: true }),
  updatedAt:         timestamp('updated_at', { withTimezone: true }),
  raw:               jsonb('raw').notNull(),
  syncedAt:          timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pipelineIdx:    index('deals_pipeline_idx').on(t.pipelineId),
  responsibleIdx: index('deals_responsible_idx').on(t.responsibleUserId),
}))

/**
 * Денормализованная таблица регистраций сим-карт.
 * Один сотрудник + одна дата = одна запись (одна сделка соответствует одному оформлению).
 * Это вью-подобная таблица для быстрого построения отчёта;
 * sync-модуль перезаписывает её при импорте сделок.
 *
 * Если в будущем появится возможность нескольких регистраций в одной сделке —
 * меняем PK без правок отчётного модуля.
 */
export const simRegistrations = pgTable('sim_registrations', {
  dealId:            bigint('deal_id', { mode: 'number' }).notNull(),
  responsibleUserId: bigint('responsible_user_id', { mode: 'number' }).notNull(),
  registeredOn:      date('registered_on').notNull(),
  syncedAt:          timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk:       primaryKey({ columns: [t.dealId] }),
  userIdx:  index('sim_user_idx').on(t.responsibleUserId),
  dateIdx:  index('sim_date_idx').on(t.registeredOn),
}))

/**
 * История переходов сделок между этапами воронки. Append-only лог,
 * заполняется из amoCRM events API (тип `lead_status_changed`).
 *
 * Зачем отдельно: в самой сделке amoCRM нет даты, когда она попала
 * на конкретный этап, есть только текущий status_id. Чтобы построить
 * график "сколько номеров включилось в день N", нам нужна дата
 * перехода на стадию "Договор отправлен" / "Успешно реализовано".
 *
 * id — это event id из amoCRM (строка), он и есть PK, что даёт
 * естественный апсёрт-by-id при повторном sync'е окна событий.
 */
export const leadStatusTransitions = pgTable('lead_status_transitions', {
  id:         text('id').primaryKey(),
  dealId:     bigint('deal_id',     { mode: 'number' }).notNull(),
  statusId:   bigint('status_id',   { mode: 'number' }).notNull(),
  pipelineId: bigint('pipeline_id', { mode: 'number' }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  syncedAt:   timestamp('synced_at',   { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusOccurredIdx: index('lst_status_occurred_idx').on(t.statusId, t.occurredAt),
  dealIdx:           index('lst_deal_idx').on(t.dealId),
}))

/**
 * Платежи из смарт-процесса Bitrix24 (entityTypeId 1032).
 * Синхронизируются через POST /api/payments/sync.
 */
export const payments = pgTable('payments', {
  id:        bigint('id', { mode: 'number' }).primaryKey(),
  amount:    integer('amount').notNull(),
  type:      text('type').notNull(),           // 'income' | 'expense'
  category:  text('category').notNull(),
  paymentDate: date('payment_date').notNull(),
  title:       text('title'),
  companyName: text('company_name'),
  raw:         jsonb('raw').notNull(),
  syncedAt:  timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  typeIdx: index('payments_type_idx').on(t.type),
  dateIdx: index('payments_date_idx').on(t.paymentDate),
}))

export type AmocrmUser     = typeof amocrmUsers.$inferSelect
export type AmocrmDeal     = typeof amocrmDeals.$inferSelect
export type SimRegistration = typeof simRegistrations.$inferSelect
export type LeadStatusTransition = typeof leadStatusTransitions.$inferSelect
