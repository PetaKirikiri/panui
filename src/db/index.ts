import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

function connectionString(): string {
  const direct = process.env.DATABASE_URL?.trim()
  if (direct) return direct
  const password = process.env.SUPABASE_DB_PASSWORD
  const ref = process.env.SUPABASE_PROJECT_REF?.trim()
  if (password && ref && ref !== 'your-project-ref') {
    return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`
  }
  throw new Error(
    'Set DATABASE_URL or SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD (see .env.example).',
  )
}

const pool = new Pool({ connectionString: connectionString() })
export const db = drizzle(pool, { schema })
