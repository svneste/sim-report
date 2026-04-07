import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const sql = postgres(url, { max: 1 })
const db  = drizzle(sql)

await migrate(db, { migrationsFolder: './src/db/migrations' })
console.log('migrations applied')
await sql.end()
