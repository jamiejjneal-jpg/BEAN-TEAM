import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Monday-start ISO week (YYYY-MM-DD string).
function weekStartOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 Sun..6 Sat
  const diff = (dow + 6) % 7 // Mon=0
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { error: null, user }
}

function getWalkerId(request: Request): string | null {
  const url = new URL(request.url)
  return url.searchParams.get('id')
}

export async function GET(request: Request) {
  const { error, user: _user } = await requireAdmin()
  if (error) return error
  const walkerId = getWalkerId(request)
  if (!walkerId) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const admin = createAdminClient()

  const [walkerRes, rateRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, phone, avatar_url').eq('id', walkerId).maybeSingle(),
    admin.from('walker_profiles').select('hourly_rate').eq('id', walkerId).maybeSingle(),
  ])
  if (!walkerRes.data) return NextResponse.json({ error: 'Walker not found' }, { status: 404 })

  const hourlyRate = Number(rateRes.data?.hourly_rate) || 0

  const { data: bookings } = await admin
    .from('bookings')
    .select('id, scheduled_date, duration_minutes, status, client_id, dog_id')
    .eq('walker_id', walkerId)
    .eq('status', 'completed')
    .order('scheduled_date', { ascending: false })

  const buckets = new Map<string, { week_start: string; walks: number; minutes: number; amount: number }>()
  for (const b of bookings || []) {
    if (!b.scheduled_date) continue
    const ws = weekStartOf(b.scheduled_date)
    const cur = buckets.get(ws) || { week_start: ws, walks: 0, minutes: 0, amount: 0 }
    cur.walks += 1
    cur.minutes += b.duration_minutes || 0
    cur.amount += ((b.duration_minutes || 0) / 60) * hourlyRate
    buckets.set(ws, cur)
  }

  const { data: payouts } = await admin
    .from('walker_payouts')
    .select('id, week_start, amount, walks_count, total_minutes, paid_at, paid_by, notes')
    .eq('walker_id', walkerId)

  const paidMap = new Map<string, any>((payouts || []).map((p: any) => [p.week_start, p]))

  const weeks = Array.from(buckets.values())
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map(w => {
      const paid = paidMap.get(w.week_start)
      return {
        week_start: w.week_start,
        walks: w.walks,
        minutes: w.minutes,
        amount: Number(w.amount.toFixed(2)),
        paid: !!paid,
        paid_at: paid?.paid_at || null,
        notes: paid?.notes || '',
        payout_id: paid?.id || null,
      }
    })

  const totalUnpaid = weeks.filter(w => !w.paid).reduce((s, w) => s + w.amount, 0)
  const totalPaid = weeks.filter(w => w.paid).reduce((s, w) => s + w.amount, 0)

  return NextResponse.json({
    walker: walkerRes.data,
    hourly_rate: hourlyRate,
    weeks,
    summary: {
      total_unpaid: Number(totalUnpaid.toFixed(2)),
      total_paid: Number(totalPaid.toFixed(2)),
      unpaid_count: weeks.filter(w => !w.paid).length,
    },
  })
}

export async function POST(request: Request) {
  const { error, user } = await requireAdmin()
  if (error) return error
  const walkerId = getWalkerId(request)
  if (!walkerId) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const body = await request.json()
  const { week_start, amount, walks_count, total_minutes, notes } = body as {
    week_start?: string; amount?: number; walks_count?: number; total_minutes?: number; notes?: string
  }
  if (!week_start || typeof amount !== 'number') {
    return NextResponse.json({ error: 'week_start and amount required' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error: upErr } = await admin.from('walker_payouts').upsert({
    walker_id: walkerId,
    week_start,
    amount,
    walks_count: walks_count || 0,
    total_minutes: total_minutes || 0,
    paid_at: new Date().toISOString(),
    paid_by: user!.id,
    notes: notes || '',
  }, { onConflict: 'walker_id,week_start' })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { error } = await requireAdmin()
  if (error) return error
  const walkerId = getWalkerId(request)
  if (!walkerId) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const url = new URL(request.url)
  const weekStart = url.searchParams.get('week_start')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const admin = createAdminClient()
  const { error: delErr } = await admin
    .from('walker_payouts')
    .delete()
    .eq('walker_id', walkerId)
    .eq('week_start', weekStart)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
