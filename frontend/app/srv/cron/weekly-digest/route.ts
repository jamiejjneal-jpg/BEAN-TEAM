import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendAdminWeeklyDigest,
  sendClientWeeklyDigest,
  type WalkerKpi,
  type ClientWeeklyWalk,
} from '@/lib/email'

// Protected cron endpoint. Computes last-7-days KPIs, emails admins the
// overall report and each active client their personal walk summary.
//
// Call with:
//   GET/POST /api/cron/weekly-digest
//   Header: Authorization: Bearer <CRON_SECRET>
//
// Recommended schedule: every Sunday 18:00 (local) via cron-job.org or Vercel Cron.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekAgoIso = weekAgo.toISOString()
  const weekAgoDate = weekAgo.toISOString().slice(0, 10)
  const weekLabel = `${weekAgo.toDateString().slice(4)} – ${now.toDateString().slice(4)}`

  const admin = createAdminClient()

  // 1. Fetch all bookings scheduled in last 7 days
  const { data: recentBookings } = await admin
    .from('bookings')
    .select('id, client_id, walker_id, dog_id, status, scheduled_date, duration_minutes, created_at')
    .gte('scheduled_date', weekAgoDate)
  const bookings = recentBookings || []

  // 2. Fetch all bookings created in last 7 days (for "new bookings" KPI)
  const { data: createdRecent } = await admin
    .from('bookings')
    .select('id, client_id, status, created_at')
    .gte('created_at', weekAgoIso)
  const createdBookings = createdRecent || []

  // 3. Fetch walk_logs with photos in last 7 days
  const { data: recentLogs } = await admin
    .from('walk_logs')
    .select('id, booking_id, photo_url, created_at')
    .gte('created_at', weekAgoIso)
  const logs = recentLogs || []
  const photoLogs = logs.filter(l => l.photo_url)

  // 4. Fetch profiles we need (walkers + clients referenced)
  const walkerIds = Array.from(new Set(bookings.map(b => b.walker_id).filter(Boolean) as string[]))
  const clientIds = Array.from(new Set(bookings.map(b => b.client_id).filter(Boolean) as string[]))
  const allIds = Array.from(new Set([...walkerIds, ...clientIds]))

  const { data: profiles } = allIds.length
    ? await admin.from('profiles').select('id, full_name, email, role, created_at').in('id', allIds)
    : { data: [] as any[] }
  const profileMap = new Map<string, any>((profiles || []).map(p => [p.id, p]))

  // Fetch active admin emails
  const { data: admins } = await admin
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq('is_active', true)
  const adminEmails = (admins || []).map(a => a.email).filter(Boolean) as string[]

  // Fetch dog names referenced
  const dogIds = Array.from(new Set(bookings.map(b => b.dog_id).filter(Boolean) as string[]))
  const { data: dogs } = dogIds.length
    ? await admin.from('dogs').select('id, name').in('id', dogIds)
    : { data: [] as any[] }
  const dogMap = new Map<string, any>((dogs || []).map(d => [d.id, d]))

  // 5. Ratings for walkers (last 7 days)
  const { data: recentReviews } = await admin
    .from('reviews')
    .select('walker_id, rating')
    .gte('created_at', weekAgoIso)
  const ratingsByWalker = new Map<string, number[]>()
  for (const r of recentReviews || []) {
    const arr = ratingsByWalker.get(r.walker_id) || []
    arr.push(r.rating)
    ratingsByWalker.set(r.walker_id, arr)
  }

  // 5b. Walker hourly rates for revenue calc
  const { data: walkerProfiles } = walkerIds.length
    ? await admin.from('walker_profiles').select('id, hourly_rate').in('id', walkerIds)
    : { data: [] as any[] }
  const rateByWalker = new Map<string, number>(
    (walkerProfiles || []).map((w: any) => [w.id, Number(w.hourly_rate) || 0])
  )

  // 6. New clients this week
  const { data: newClientsRes } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'client')
    .gte('created_at', weekAgoIso)
  const newClients = (newClientsRes || []).length

  // ---- Compute admin KPIs ----
  const completedBookings = bookings.filter(b => b.status === 'completed')
  const pendingBookings = createdBookings.filter(b => b.status === 'pending').length
  const cancelled = bookings.filter(b => b.status === 'cancelled').length
  const totalMinutes = completedBookings.reduce((s, b) => s + (b.duration_minutes || 0), 0)
  const totalPhotos = photoLogs.length

  const walkerStats = new Map<string, { walks: number; minutes: number; photos: number; revenue: number }>()
  for (const b of completedBookings) {
    if (!b.walker_id) continue
    const cur = walkerStats.get(b.walker_id) || { walks: 0, minutes: 0, photos: 0, revenue: 0 }
    cur.walks += 1
    cur.minutes += b.duration_minutes || 0
    const rate = rateByWalker.get(b.walker_id) || 0
    cur.revenue += ((b.duration_minutes || 0) / 60) * rate
    walkerStats.set(b.walker_id, cur)
  }
  for (const log of photoLogs) {
    const b = bookings.find(x => x.id === log.booking_id)
    if (b?.walker_id) {
      const cur = walkerStats.get(b.walker_id) || { walks: 0, minutes: 0, photos: 0, revenue: 0 }
      cur.photos += 1
      walkerStats.set(b.walker_id, cur)
    }
  }

  const walkerRows: WalkerKpi[] = Array.from(walkerStats.entries())
    .map(([wid, s]) => {
      const ratings = ratingsByWalker.get(wid) || []
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
      return {
        name: profileMap.get(wid)?.full_name || 'Unknown walker',
        walks: s.walks,
        minutes: s.minutes,
        avgRating: avg,
        photos: s.photos,
        revenue: s.revenue,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = walkerRows.reduce((s, w) => s + w.revenue, 0)

  // Top client by walks
  const walksByClient = new Map<string, number>()
  for (const b of completedBookings) {
    if (!b.client_id) continue
    walksByClient.set(b.client_id, (walksByClient.get(b.client_id) || 0) + 1)
  }
  let topClient: { name: string; walks: number } | undefined
  let topWalks = 0
  for (const [cid, w] of walksByClient.entries()) {
    if (w > topWalks) {
      topWalks = w
      topClient = { name: profileMap.get(cid)?.full_name || 'Unknown client', walks: w }
    }
  }

  // ---- Send admin digest ----
  if (adminEmails.length > 0) {
    await sendAdminWeeklyDigest({
      to: adminEmails,
      weekLabel,
      totalWalks: completedBookings.length,
      totalMinutes,
      totalPhotos,
      totalRevenue,
      pendingBookings,
      newClients,
      newBookings: createdBookings.length,
      cancelled,
      walkerRows,
      topClient,
    })
  }

  // ---- Send per-client digests ----
  const byClient = new Map<string, ClientWeeklyWalk[]>()
  const photosByBooking = new Map<string, number>()
  for (const log of photoLogs) {
    photosByBooking.set(log.booking_id, (photosByBooking.get(log.booking_id) || 0) + 1)
  }

  for (const b of completedBookings) {
    if (!b.client_id) continue
    const list = byClient.get(b.client_id) || []
    list.push({
      dogName: dogMap.get(b.dog_id)?.name || 'Your dog',
      date: b.scheduled_date,
      walkerName: profileMap.get(b.walker_id || '')?.full_name || 'Your walker',
      durationMinutes: b.duration_minutes || 0,
      photoCount: photosByBooking.get(b.id) || 0,
    })
    byClient.set(b.client_id, list)
  }

  let clientEmailsSent = 0
  for (const [cid, walks] of byClient.entries()) {
    const clientProfile = profileMap.get(cid)
    if (!clientProfile?.email) continue

    // Favourite walker (most frequent)
    const walkerCount = new Map<string, number>()
    for (const w of walks) walkerCount.set(w.walkerName, (walkerCount.get(w.walkerName) || 0) + 1)
    let favouriteWalker: string | undefined
    let topCount = 0
    for (const [n, c] of walkerCount.entries()) {
      if (c > topCount) { topCount = c; favouriteWalker = n }
    }

    const totalPhotosForClient = walks.reduce((s, w) => s + w.photoCount, 0)
    await sendClientWeeklyDigest({
      to: clientProfile.email,
      clientName: clientProfile.full_name || '',
      weekLabel,
      walks,
      favouriteWalker,
      totalPhotos: totalPhotosForClient,
    })
    clientEmailsSent += 1
  }

  return NextResponse.json({
    ok: true,
    weekLabel,
    adminDigestSentTo: adminEmails.length,
    clientDigestsSent: clientEmailsSent,
    totalWalks: completedBookings.length,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    pendingBookings,
  })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
