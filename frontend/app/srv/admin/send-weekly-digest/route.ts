import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Admin-only trigger for the weekly digest. Proxies to /srv/cron/weekly-digest
// using the CRON_SECRET so admins can send the report on demand from the UI.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })

  const origin = new URL(request.url).origin
  const res = await fetch(`${origin}/srv/cron/weekly-digest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
