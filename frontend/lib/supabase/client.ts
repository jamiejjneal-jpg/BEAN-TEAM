import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton — one Supabase client per browser tab.
// Previously every component that called `createClient()` got a brand-new
// GoTrueClient, all racing for the same localStorage auth lock. On the live
// site this caused `supabase.auth.getUser()` to hang indefinitely, leaving
// the UI stuck on "Loading your session…". Reusing a single instance fixes
// the lock contention and eliminates the "Multiple GoTrueClient instances
// detected" warning.
let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}
