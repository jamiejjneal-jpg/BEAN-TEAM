import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Force this route to be evaluated only at request time. Prevents Next.js
// from trying to call the Supabase admin client during static-page collection
// at build time (which would crash if SUPABASE_SERVICE_ROLE_KEY is unset).
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { error: null }
}

type Check = { name: string; status: 'ok' | 'warn' | 'fail'; message: string }

export async function GET() {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const admin = createAdminClient()
  const checks: Check[] = []

  // --- Env vars
  const resendKey = !!process.env.RESEND_API_KEY
  checks.push({
    name: 'Resend API key',
    status: resendKey ? 'ok' : 'fail',
    message: resendKey ? 'Configured' : 'RESEND_API_KEY missing — emails will not send',
  })

  const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev'
  const sandboxed = sender.includes('onboarding@resend.dev')
  checks.push({
    name: 'Email sender',
    status: sandboxed ? 'warn' : 'ok',
    message: sandboxed
      ? `Sandbox sender (${sender}) — can only email the Resend account owner. Verify a domain to reach clients/walkers.`
      : `Using verified sender: ${sender}`,
  })

  const cronSecret = !!process.env.CRON_SECRET
  checks.push({
    name: 'Cron secret',
    status: cronSecret ? 'ok' : 'warn',
    message: cronSecret ? 'Configured' : 'CRON_SECRET not set — weekly digest endpoint is unprotected',
  })

  // --- Supabase connectivity
  try {
    const { error, count } = await admin.from('profiles').select('id', { count: 'exact', head: true })
    checks.push({
      name: 'Supabase database',
      status: error ? 'fail' : 'ok',
      message: error ? `Query failed: ${error.message}` : `Connected · ${count || 0} profiles`,
    })
  } catch (e: any) {
    checks.push({ name: 'Supabase database', status: 'fail', message: e.message })
  }

  // --- Required tables
  const tableChecks: { table: string; expect: string }[] = [
    { table: 'walker_payouts', expect: 'Weekly payouts tracking' },
    { table: 'walk_log_comments', expect: 'Gallery photo comments' },
    { table: 'walk_logs', expect: 'Walk photos & events' },
    { table: 'notifications', expect: 'In-app notifications' },
  ]
  for (const t of tableChecks) {
    const { error } = await admin.from(t.table).select('*', { count: 'exact', head: true })
    checks.push({
      name: `Table: ${t.table}`,
      status: error ? 'fail' : 'ok',
      message: error ? `Missing/inaccessible (${t.expect}) — run the matching SQL migration` : t.expect,
    })
  }

  // --- Required profiles columns (rebrand + new fields)
  {
    const { error } = await admin.from('profiles').select('key_code, key_location, emergency_contact, emergency_phone').limit(1)
    checks.push({
      name: 'Profile extension columns',
      status: error ? 'fail' : 'ok',
      message: error ? `Columns missing — run profile/admin migration: ${error.message}` : 'key_code, key_location, emergency_contact, emergency_phone all present',
    })
  }

  // --- Required dogs columns
  {
    const { error } = await admin.from('dogs').select('vet_name, vet_phone, microchip_number, vaccination_details, off_lead').limit(1)
    checks.push({
      name: 'Dog extension columns',
      status: error ? 'fail' : 'ok',
      message: error ? `Columns missing — run dog extension SQL: ${error.message}` : 'Vet, microchip, vaccination, off-lead columns all present',
    })
  }

  // --- Storage bucket + write test
  try {
    const { data: buckets } = await admin.storage.listBuckets()
    const bucket = buckets?.find(b => b.name === 'dog-photos')
    if (!bucket) {
      checks.push({ name: 'Storage bucket', status: 'fail', message: 'dog-photos bucket missing' })
    } else {
      checks.push({ name: 'Storage bucket', status: bucket.public ? 'ok' : 'warn', message: bucket.public ? 'dog-photos bucket · public-read' : 'dog-photos bucket exists but is not public — clients will not see photos' })

      // Try an actual upload + delete to verify INSERT policy
      const testPath = `_health/${Date.now()}.txt`
      const { error: upErr } = await admin.storage.from('dog-photos').upload(testPath, new Blob(['ok'], { type: 'text/plain' }))
      if (upErr) {
        checks.push({ name: 'Storage write', status: 'fail', message: `Upload failed: ${upErr.message} — run storage RLS SQL` })
      } else {
        await admin.storage.from('dog-photos').remove([testPath])
        checks.push({ name: 'Storage write', status: 'ok', message: 'Uploads allowed · INSERT policy working' })
      }
    }
  } catch (e: any) {
    checks.push({ name: 'Storage bucket', status: 'fail', message: e.message })
  }

  // --- Data counts (contextual, not a check)
  const counts: Record<string, number> = {}
  for (const t of ['profiles', 'dogs', 'bookings', 'walk_logs', 'walk_log_comments', 'walker_payouts']) {
    try {
      const { count } = await admin.from(t).select('id', { count: 'exact', head: true })
      counts[t] = count || 0
    } catch { counts[t] = -1 }
  }

  // --- Overall status
  const hasFailure = checks.some(c => c.status === 'fail')
  const hasWarning = checks.some(c => c.status === 'warn')
  const overall = hasFailure ? 'fail' : hasWarning ? 'warn' : 'ok'

  return NextResponse.json({
    overall,
    checks,
    counts,
    app_url: process.env.APP_URL || '(unset)',
    timestamp: new Date().toISOString(),
  })
}
