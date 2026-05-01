import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

function databaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim()
  if (direct) return direct
  const password = process.env.SUPABASE_DB_PASSWORD
  const ref = process.env.SUPABASE_PROJECT_REF?.trim()
  if (password && ref && ref !== 'your-project-ref') {
    return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`
  }
  throw new Error(
    'Set DATABASE_URL in .env, or SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD (see .env.example).',
  )
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl(),
  },
})
