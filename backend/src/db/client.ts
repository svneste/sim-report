import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../core/config.js'
import * as schema from './schema.js'

const queryClient = postgres(config.DATABASE_URL, { max: 10 })
export const db = drizzle(queryClient, { schema })
export type DB = typeof db
