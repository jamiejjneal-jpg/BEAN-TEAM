import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL } from './public-config'

export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      'Supabase admin client missing env: set SUPABASE_SERVICE_ROLE_KEY in your deployment environment.'
    )
  }
  return createClient(PUBLIC_SUPABASE_URL, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
