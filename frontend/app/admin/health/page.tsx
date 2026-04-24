'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, Database, Mail, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createClient as createRawSupabase } from '@supabase/supabase-js'

type Check = { name: string; status: 'ok' | 'warn' | 'fail'; message: string }
type Result = { overall: 'ok' | 'warn' | 'fail'; checks: Check[]; counts: Record<string, number>; timestamp: string }

const TABLES = ['profiles', 'dogs', 'bookings', 'walk_logs', 'walk_log_comments', 'walker_payouts', 'notifications', 'site_images'] as const

async function runChecks(supabase: ReturnType<typeof createClient>): Promise<Result> {
  const checks: Check[] = []
  const counts: Record<string, number> = {}

  // --- Auth
  const { data: { user } } = await supabase.auth.getUser()
  checks.push({
    name: 'Signed-in admin',
    status: user ? 'ok' : 'fail',
    message: user ? `Authenticated as ${user.email}` : 'No active session',
  })

  // --- Table existence + counts
  for (const t of TABLES) {
    try {
      const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true })
      if (error) {
        checks.push({
          name: `Table: ${t}`,
          status: 'fail',
          message: `${error.message || 'Query failed'}${error.hint ? ` — ${error.hint}` : ''}`,
        })
      } else {
        counts[t] = count || 0
        checks.push({ name: `Table: ${t}`, status: 'ok', message: `OK · ${count || 0} rows` })
      }
    } catch (e: any) {
      checks.push({ name: `Table: ${t}`, status: 'fail', message: e.message })
    }
  }

  // --- Required profile columns
  try {
    const { error } = await supabase.from('profiles').select('key_code, key_location, emergency_contact, emergency_phone').limit(1)
    checks.push({
      name: 'Profile extension columns',
      status: error ? 'fail' : 'ok',
      message: error ? `Missing columns — run profile/admin migration: ${error.message}` : 'key_code, key_location, emergency_contact, emergency_phone all present',
    })
  } catch (e: any) {
    checks.push({ name: 'Profile extension columns', status: 'fail', message: e.message })
  }

  // --- Required dogs columns
  try {
    const { error } = await supabase.from('dogs').select('vet_name, vet_phone, microchip_number, vaccination_details, off_lead').limit(1)
    checks.push({
      name: 'Dog extension columns',
      status: error ? 'fail' : 'ok',
      message: error ? `Missing columns — run dog extension SQL: ${error.message}` : 'Vet, microchip, vaccination, off-lead columns all present',
    })
  } catch (e: any) {
    checks.push({ name: 'Dog extension columns', status: 'fail', message: e.message })
  }

  // --- Storage buckets — anon key can't call listBuckets(), so probe each one with a list-objects call
  for (const name of ['dog-photos', 'site-images'] as const) {
    try {
      const { error } = await supabase.storage.from(name).list('', { limit: 1 })
      if (error) {
        checks.push({ name: `Bucket: ${name}`, status: 'fail', message: `Missing or not accessible — ${error.message}` })
      } else {
        checks.push({ name: `Bucket: ${name}`, status: 'ok', message: 'Reachable' })
      }
    } catch (e: any) {
      checks.push({ name: `Bucket: ${name}`, status: 'fail', message: e.message })
    }
  }

  // --- SECURITY: live RLS verification ---------------------------------
  // We spin up a fresh, *anonymous* Supabase client (no session, no cookies)
  // and try to read admin-only tables as if we were a stranger. Each one
  // MUST return zero rows (and may return an explicit RLS error). If we
  // actually get rows back, RLS is misconfigured and we flag it hard.
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    const raw = createRawSupabase(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

    const SECURITY_TABLES: { table: string; mustBlock: boolean; label: string }[] = [
      { table: 'audit_log',          mustBlock: true,  label: 'Audit log hidden from strangers' },
      { table: 'email_automations',  mustBlock: true,  label: 'Email automations hidden from strangers' },
      { table: 'walker_payouts',     mustBlock: true,  label: 'Walker payouts hidden from strangers' },
      { table: 'site_images',        mustBlock: false, label: 'Site images readable publicly (needed for landing page)' },
    ]

    for (const t of SECURITY_TABLES) {
      try {
        const { data, error } = await raw.from(t.table).select('*', { count: 'exact' }).limit(1)
        if (t.mustBlock) {
          // Either an auth/RLS error, OR an empty result, means RLS is doing its job.
          const rowCount = Array.isArray(data) ? data.length : 0
          if (error || rowCount === 0) {
            checks.push({ name: t.label, status: 'ok', message: error ? `Blocked (${error.code || 'RLS'})` : 'RLS returns 0 rows to strangers' })
          } else {
            checks.push({ name: t.label, status: 'fail', message: `🚨 RLS NOT enforced — stranger could read ${rowCount}+ row(s) from ${t.table}. Re-run /app/supabase_rls_admin_tightening.sql.` })
          }
        } else {
          // For site_images we *want* public reads to succeed.
          if (error) {
            checks.push({ name: t.label, status: 'warn', message: `Public read blocked — ${error.message}. Landing-page hero may not render for anon visitors.` })
          } else {
            checks.push({ name: t.label, status: 'ok', message: 'Public read works' })
          }
        }
      } catch (e: any) {
        checks.push({ name: t.label, status: 'warn', message: `Check failed: ${e.message}` })
      }
    }
  } catch (e: any) {
    checks.push({ name: 'Security check runner', status: 'warn', message: `Couldn't run anonymous probe: ${e.message}` })
  }

  const hasFailure = checks.some(c => c.status === 'fail')
  const hasWarning = checks.some(c => c.status === 'warn')
  const overall = hasFailure ? 'fail' : hasWarning ? 'warn' : 'ok'

  return { overall, checks, counts, timestamp: new Date().toISOString() }
}

export default function HealthPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Result | null>(null)

  async function run() {
    setLoading(true)
    try {
      const res = await runChecks(supabase)
      setData(res)
    } catch (e: any) {
      setData({
        overall: 'fail',
        checks: [{ name: 'Health runner', status: 'fail', message: e.message || 'Unexpected error' }],
        counts: {},
        timestamp: new Date().toISOString(),
      })
    }
    setLoading(false)
  }

  useEffect(() => { run() }, [])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" />
      </div>
    )
  }

  const iconFor = (s: string) => s === 'ok' ? <CheckCircle2 className="h-5 w-5 text-[#2D7A5D] shrink-0 mt-0.5" />
    : s === 'warn' ? <AlertTriangle className="h-5 w-5 text-[#DDA74F] shrink-0 mt-0.5" />
    : <XCircle className="h-5 w-5 text-[#E06D53] shrink-0 mt-0.5" />

  const overallBadge = {
    ok: { bg: '#2D7A5D', label: 'All systems operational' },
    warn: { bg: '#DDA74F', label: 'Attention needed' },
    fail: { bg: '#E06D53', label: 'Critical issues' },
  }[(data?.overall || 'ok') as 'ok' | 'warn' | 'fail']

  return (
    <div className="space-y-6" data-testid="admin-health-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-[#1A4331]" /> System Health
          </h1>
          <p className="text-[#5C5C5C] mt-1">Database, storage and migration checks (runs directly from your browser)</p>
        </div>
        <Button onClick={run} variant="outline" size="sm" disabled={loading} data-testid="health-refresh">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking...</> : <><RefreshCw className="h-4 w-4 mr-2" /> Run checks</>}
        </Button>
      </div>

      <Card className="border-l-4" style={{ borderLeftColor: overallBadge.bg }}>
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${overallBadge.bg}20` }}>
              {data?.overall === 'ok' && <CheckCircle2 className="h-5 w-5" style={{ color: overallBadge.bg }} />}
              {data?.overall === 'warn' && <AlertTriangle className="h-5 w-5" style={{ color: overallBadge.bg }} />}
              {data?.overall === 'fail' && <XCircle className="h-5 w-5" style={{ color: overallBadge.bg }} />}
            </div>
            <div>
              <p className="font-heading font-semibold" style={{ color: overallBadge.bg }}>{overallBadge.label}</p>
              <p className="text-xs text-[#8A8A8A]">Last checked: {data?.timestamp ? new Date(data.timestamp).toLocaleString('en-GB') : '—'}</p>
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#E8F0EC] text-[#2D7A5D]">{data?.checks.filter((c: Check) => c.status === 'ok').length} OK</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#FDF8EF] text-[#8A6A2A]">{data?.checks.filter((c: Check) => c.status === 'warn').length} warn</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#FDEDEA] text-[#E06D53]">{data?.checks.filter((c: Check) => c.status === 'fail').length} fail</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" /> Data at a glance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {data?.counts && Object.entries(data.counts).map(([k, v]) => (
              <div key={k} className="p-3 rounded-lg bg-[#F9F8F6] border border-[#E5E3DB] text-center">
                <p className="text-2xl font-heading font-bold text-[#1A4331]">{v as number}</p>
                <p className="text-xs text-[#8A8A8A] capitalize mt-0.5">{k.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(() => {
        const securityChecks = (data?.checks || []).filter((c: Check) =>
          c.name.includes('hidden from strangers') || c.name.includes('readable publicly') || c.name === 'Security check runner'
        )
        if (securityChecks.length === 0) return null
        const anyFail = securityChecks.some(c => c.status === 'fail')
        const anyWarn = securityChecks.some(c => c.status === 'warn')
        const tone = anyFail ? 'bg-[#FDEDEA] border-[#E06D53]' : anyWarn ? 'bg-[#FDF8EF] border-[#DDA74F]' : 'bg-[#E8F0EC] border-[#1A4331]'
        return (
          <Card className={`border-l-4 ${tone}`} data-testid="security-check-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Security check — can strangers read your admin data?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[#5C5C5C] mb-3">
                These tests spin up an anonymous (signed-out) connection and try to read your admin-only tables. If any row comes back, RLS isn&apos;t doing its job — you&apos;d need to re-run the RLS hardening SQL.
              </p>
              <div className="space-y-2">
                {securityChecks.map((c, i) => (
                  <div key={i} className="flex items-start gap-2" data-testid={`security-check-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                    {iconFor(c.status)}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#1A1A1A]">{c.name}</p>
                      <p className={`text-xs ${c.status === 'fail' ? 'text-[#E06D53]' : 'text-[#5C5C5C]'}`}>{c.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              {!anyFail && !anyWarn && (
                <div className="mt-3 text-xs rounded-md bg-white/60 border border-[#1A4331]/20 p-2 text-[#1A4331]">
                  ✅ All admin tables are locked down. A stranger typing <code>/admin</code> in the URL gets nothing — UI redirects AND the database refuses.
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <Card>
        <CardHeader><CardTitle className="text-sm">Database & migration checks</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-[#F2F0EB]">
            {data?.checks?.map((c: Check, i: number) => (
              <div key={i} className="flex items-start gap-3 p-4" data-testid={`health-check-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                {iconFor(c.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{c.name}</p>
                    <Badge variant={c.status === 'ok' ? 'success' : c.status === 'warn' ? 'default' : 'destructive'} className="text-[10px]">{c.status.toUpperCase()}</Badge>
                  </div>
                  <p className={`text-sm mt-0.5 ${c.status === 'fail' ? 'text-[#E06D53]' : 'text-[#5C5C5C]'}`}>{c.message}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Server-side integrations</CardTitle></CardHeader>
        <CardContent className="text-sm text-[#5C5C5C] space-y-2">
          <p>
            This page validates everything that runs against Supabase (tables, columns, storage buckets, RLS reachable from the browser).
          </p>
          <p className="text-xs text-[#8A8A8A]">
            Email (Resend) and cron-triggered weekly digests run on the server and are not included here — the deployed static site can&apos;t reach those endpoints.
            If you&apos;re seeing 500/404 errors when sending emails or generating exports, those are the cause.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
