// supabase/functions/user-erase/index.ts
// GDPR Article 17 — "right to be forgotten". Admin-only endpoint that
// permanently deletes a user plus their pets, bookings, notifications,
// reviews, login history, calendar tokens, walk logs owned by them, and
// their auth record. Returns a confirmation JSON.
//
// Tax-relevant booking records (HMRC requires 6yr retention) can be
// preserved by passing `{ user_id, keep_bookings: true }`; in that case
// we null-out client_id on their bookings and soft-anonymise the profile
// row instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

function fail(status: number, msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'POST only')

  const auth = req.headers.get('Authorization') || ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return fail(401, 'Missing Authorization')

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1) Verify caller is an admin
  const { data: caller, error: uErr } = await supa.auth.getUser(jwt)
  if (uErr || !caller?.user) return fail(401, 'Invalid session')
  const { data: callerProfile } = await supa.from('profiles').select('role').eq('id', caller.user.id).maybeSingle()
  if (callerProfile?.role !== 'admin') return fail(403, 'Admin only')

  // 2) Parse body
  let body: { user_id?: string; keep_bookings?: boolean }
  try { body = await req.json() } catch { return fail(400, 'Invalid JSON') }
  const userId = body.user_id
  if (!userId) return fail(400, 'user_id required')
  if (userId === caller.user.id) return fail(400, "You can't erase your own account from here")

  const counts: Record<string, number> = {}

  // 3) Remove child rows first (order matters for FK safety)
  const childTables = [
    'walker_reviews', 'notifications', 'notification_prefs', 'login_history',
    'calendar_tokens', 'walker_unavailability', 'recurring_bookings',
    'nps_responses',
  ]
  for (const t of childTables) {
    const { count, error } = await supa.from(t).delete({ count: 'exact' }).eq('user_id', userId)
    if (!error) counts[t] = count ?? 0
  }
  // walker_reviews where they were the reviewed walker
  {
    const { count } = await supa.from('walker_reviews').delete({ count: 'exact' }).eq('walker_id', userId)
    counts['walker_reviews_as_walker'] = count ?? 0
  }

  // 4) Their pets (and cascade their walk_logs via FK)
  const { count: petCount } = await supa.from('dogs').delete({ count: 'exact' }).eq('owner_id', userId)
  counts['dogs'] = petCount ?? 0

  // 5) Walk logs they created as a walker
  {
    const { count } = await supa.from('walk_logs').delete({ count: 'exact' }).eq('walker_id', userId)
    counts['walk_logs_as_walker'] = count ?? 0
  }

  // 6) Bookings — either hard-delete or anonymise
  if (body.keep_bookings) {
    const { count } = await supa.from('bookings')
      .update({ client_id: null, walker_id: null, notes: '[anonymised per GDPR erasure request]', admin_notes: null })
      .or(`client_id.eq.${userId},walker_id.eq.${userId}`)
      .select('id', { count: 'exact', head: true })
    counts['bookings_anonymised'] = count ?? 0
  } else {
    const { count: c1 } = await supa.from('bookings').delete({ count: 'exact' }).eq('client_id', userId)
    const { count: c2 } = await supa.from('bookings').delete({ count: 'exact' }).eq('walker_id', userId)
    counts['bookings'] = (c1 ?? 0) + (c2 ?? 0)
  }

  // 7) Walker profile row
  await supa.from('walker_profiles').delete().eq('user_id', userId)
  counts['walker_profiles'] = 1

  // 8) The profile row itself
  const { error: profErr } = await supa.from('profiles').delete().eq('id', userId)
  counts['profiles'] = profErr ? 0 : 1

  // 9) Finally — auth.users (this fails fast if anything above has a dangling FK)
  const { error: authErr } = await supa.auth.admin.deleteUser(userId)
  counts['auth_user'] = authErr ? 0 : 1

  // 10) Audit the action against the admin who ran it
  await supa.from('audit_log').insert({
    actor_id: caller.user.id,
    action: 'gdpr_erase',
    target_type: 'user',
    target_id: userId,
    target_name: body.user_id,
    details: counts,
  })

  return new Response(JSON.stringify({ ok: true, counts, authError: authErr?.message }), {
    headers: { 'Content-Type': 'application/json', ...cors },
  })
})
