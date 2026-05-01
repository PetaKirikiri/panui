import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: true })

const url = process.env.VITE_SUPABASE_URL?.trim()
if (!url) {
  console.error('Set VITE_SUPABASE_URL in .env (see .env.example).')
  process.exit(1)
}

const keys = [
  { name: 'VITE_SUPABASE_ANON_KEY', value: process.env.VITE_SUPABASE_ANON_KEY },
  { name: 'PUBLISHABLE_KEY', value: process.env.PUBLISHABLE_KEY },
]

for (const { name, value } of keys) {
  if (!value) {
    console.log(`${name}: (not set) - skip`)
    continue
  }
  try {
    const supabase = createClient(url, value)
    const { error } = await supabase.auth.getSession()
    if (error) {
      console.log(`${name}: ${error.message}`)
    } else {
      console.log(`${name}: OK - got response`)
    }
  } catch (e) {
    console.log(`${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
