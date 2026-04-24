// Supabase Edge Function: weekly-digest
// Computes last-7-days KPIs, emails admins the overall report, and emails
// each active client their personal walk summary.
//
// Invocation:
//   - On demand by admins from the UI: supabase.functions.invoke('weekly-digest')
//     (caller must be authenticated AND have role='admin')
//   - Scheduled: set up in Supabase Studio → Database → Cron
//     Example: "0 18 * * 0" (Sundays at 18:00 UTC)
//     Use the "HTTP Request" cron type targeting this function's URL with
//     Authorization: Bearer <CRON_SECRET>. If CRON_SECRET is unset, the
//     function still enforces admin-JWT auth for interactive calls.
//
// Secrets:
//   RESEND_API_KEY, SENDER_EMAIL, APP_URL, CRON_SECRET (optional)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const APP_URL = Deno.env.get("APP_URL") ?? ""
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}
const jsonRes = (b: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(b), { ...init, headers: { "content-type": "application/json", ...CORS, ...(init.headers || {}) } })

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\n/g, "<br/>")
}

async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  if (!RESEND_API_KEY) { console.warn("[digest] no RESEND_API_KEY"); return }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: SENDER_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  })
  if (!res.ok) console.error("[digest] resend failed:", res.status, await res.text())
}

function wrap(headline: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const ctaHtml = cta ? `<tr><td style="padding:24px 32px 8px;"><a href="${cta.url}" style="display:inline-block;background:#1A4331;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,Helvetica,sans-serif;">${cta.label}</a></td></tr>` : ""
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F9F8F6;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F6;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #E5E3DB;overflow:hidden;"><tr><td style="background:#1A4331;padding:20px 32px;color:#fff;font-size:18px;font-weight:700;">🐾 Rocky's Retreat and Rambles</td></tr><tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1A4331;">${headline}</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:15px;line-height:1.6;color:#3C3C3C;">${bodyHtml}</td></tr>${ctaHtml}<tr><td style="padding:24px 32px 28px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;">Weekly report from Rocky's Retreat and Rambles.</td></tr></table></td></tr></table></body></html>`
}

const fmtMoney = (n: number) => `£${n.toFixed(2)}`

type WalkerKpi = { name: string; walks: number; minutes: number; avgRating: number | null; photos: number; revenue: number }
type ClientWeeklyWalk = { dogName: string; date: string; walkerName: string; durationMinutes: number; photoCount: number }

async function runDigest() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekAgoIso = weekAgo.toISOString()
  const weekAgoDate = weekAgo.toISOString().slice(0, 10)
  const weekLabel = `${weekAgo.toDateString().slice(4)} – ${now.toDateString().slice(4)}`

  const [bookingsRes, createdRes, logsRes] = await Promise.all([
    admin.from("bookings").select("id, client_id, walker_id, dog_id, status, scheduled_date, duration_minutes, created_at").gte("scheduled_date", weekAgoDate),
    admin.from("bookings").select("id, client_id, status, created_at").gte("created_at", weekAgoIso),
    admin.from("walk_logs").select("id, booking_id, photo_url, created_at").gte("created_at", weekAgoIso),
  ])
  const bookings = bookingsRes.data || []
  const createdBookings = createdRes.data || []
  const logs = logsRes.data || []
  // deno-lint-ignore no-explicit-any
  const photoLogs = logs.filter((l: any) => l.photo_url)

  // deno-lint-ignore no-explicit-any
  const walkerIds = Array.from(new Set(bookings.map((b: any) => b.walker_id).filter(Boolean) as string[]))
  // deno-lint-ignore no-explicit-any
  const clientIds = Array.from(new Set(bookings.map((b: any) => b.client_id).filter(Boolean) as string[]))
  const allIds = Array.from(new Set([...walkerIds, ...clientIds]))

  const { data: profiles } = allIds.length
    ? await admin.from("profiles").select("id, full_name, email, role, created_at").in("id", allIds)
    // deno-lint-ignore no-explicit-any
    : { data: [] as any[] }
  // deno-lint-ignore no-explicit-any
  const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]))

  const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").eq("is_active", true)
  // deno-lint-ignore no-explicit-any
  const adminEmails = (admins || []).map((a: any) => a.email).filter(Boolean) as string[]

  // deno-lint-ignore no-explicit-any
  const dogIds = Array.from(new Set(bookings.map((b: any) => b.dog_id).filter(Boolean) as string[]))
  const { data: dogs } = dogIds.length
    ? await admin.from("dogs").select("id, name").in("id", dogIds)
    // deno-lint-ignore no-explicit-any
    : { data: [] as any[] }
  // deno-lint-ignore no-explicit-any
  const dogMap = new Map<string, any>((dogs || []).map((d: any) => [d.id, d]))

  const { data: recentReviews } = await admin.from("reviews").select("walker_id, rating").gte("created_at", weekAgoIso)
  const ratingsByWalker = new Map<string, number[]>()
  for (const r of recentReviews || []) {
    // deno-lint-ignore no-explicit-any
    const rr = r as any
    const arr = ratingsByWalker.get(rr.walker_id) || []
    arr.push(rr.rating)
    ratingsByWalker.set(rr.walker_id, arr)
  }

  const { data: walkerProfiles } = walkerIds.length
    ? await admin.from("walker_profiles").select("id, hourly_rate").in("id", walkerIds)
    // deno-lint-ignore no-explicit-any
    : { data: [] as any[] }
  // deno-lint-ignore no-explicit-any
  const rateByWalker = new Map<string, number>((walkerProfiles || []).map((w: any) => [w.id, Number(w.hourly_rate) || 0]))

  const { data: newClientsRes } = await admin.from("profiles").select("id").eq("role", "client").gte("created_at", weekAgoIso)
  const newClients = (newClientsRes || []).length

  // deno-lint-ignore no-explicit-any
  const completedBookings = bookings.filter((b: any) => b.status === "completed")
  // deno-lint-ignore no-explicit-any
  const pendingBookings = createdBookings.filter((b: any) => b.status === "pending").length
  // deno-lint-ignore no-explicit-any
  const cancelled = bookings.filter((b: any) => b.status === "cancelled").length
  // deno-lint-ignore no-explicit-any
  const totalMinutes = completedBookings.reduce((s: number, b: any) => s + (b.duration_minutes || 0), 0)
  const totalPhotos = photoLogs.length

  const walkerStats = new Map<string, { walks: number; minutes: number; photos: number; revenue: number }>()
  for (const b of completedBookings) {
    // deno-lint-ignore no-explicit-any
    const bb = b as any
    if (!bb.walker_id) continue
    const cur = walkerStats.get(bb.walker_id) || { walks: 0, minutes: 0, photos: 0, revenue: 0 }
    cur.walks += 1
    cur.minutes += bb.duration_minutes || 0
    const rate = rateByWalker.get(bb.walker_id) || 0
    cur.revenue += ((bb.duration_minutes || 0) / 60) * rate
    walkerStats.set(bb.walker_id, cur)
  }
  for (const log of photoLogs) {
    // deno-lint-ignore no-explicit-any
    const ll = log as any
    // deno-lint-ignore no-explicit-any
    const b = bookings.find((x: any) => x.id === ll.booking_id) as any | undefined
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
      return { name: profileMap.get(wid)?.full_name || "Unknown walker", walks: s.walks, minutes: s.minutes, avgRating: avg, photos: s.photos, revenue: s.revenue }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = walkerRows.reduce((s, w) => s + w.revenue, 0)

  const walksByClient = new Map<string, number>()
  for (const b of completedBookings) {
    // deno-lint-ignore no-explicit-any
    const bb = b as any
    if (!bb.client_id) continue
    walksByClient.set(bb.client_id, (walksByClient.get(bb.client_id) || 0) + 1)
  }
  let topClient: { name: string; walks: number } | undefined
  let topWalks = 0
  for (const [cid, w] of walksByClient.entries()) {
    if (w > topWalks) { topWalks = w; topClient = { name: profileMap.get(cid)?.full_name || "Unknown client", walks: w } }
  }

  // ----- Admin digest email -----
  if (adminEmails.length > 0) {
    const kpi = (label: string, value: string | number, color = "#1A4331") =>
      `<td style="background:#F9F8F6;padding:14px 10px;text-align:center;border:1px solid #E5E3DB;"><div style="font-size:22px;font-weight:700;color:${color};">${value}</div><div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${label}</div></td>`

    const walkerHtml = walkerRows.length === 0
      ? `<tr><td colspan="5" style="padding:14px;text-align:center;color:#8A8A8A;font-size:13px;">No walker activity this week.</td></tr>`
      : walkerRows.map(w => `<tr><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:14px;"><strong>${escapeHtml(w.name)}</strong></td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.walks}</td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.minutes}</td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.avgRating !== null ? `⭐ ${w.avgRating.toFixed(1)}` : "—"}</td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#1A4331;font-weight:600;text-align:right;">${fmtMoney(w.revenue)}</td></tr>`).join("")

    const body = `<p>Here's how Rocky's Retreat and Rambles performed this week (<strong>${weekLabel}</strong>).</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border-collapse:separate;border-spacing:6px;">
<tr>${kpi("Revenue", fmtMoney(totalRevenue), "#2D7A5D")}${kpi("Completed walks", completedBookings.length)}${kpi("Total minutes", totalMinutes)}</tr>
<tr>${kpi("Photos uploaded", totalPhotos, "#DDA74F")}${kpi("Pending approvals", pendingBookings, pendingBookings > 0 ? "#E06D53" : "#1A4331")}${kpi("New bookings", createdBookings.length)}</tr>
<tr>${kpi("Cancelled", cancelled, "#E06D53")}${kpi("New clients", newClients)}<td style="background:#F9F8F6;padding:14px 10px;border:1px solid #E5E3DB;"><div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;">Top client</div><div style="font-size:14px;font-weight:700;color:#1A4331;margin-top:4px;">${topClient ? `${escapeHtml(topClient.name)} · ${topClient.walks}` : "—"}</div></td></tr>
</table>
<h3 style="margin:24px 0 8px;font-size:15px;color:#1A1A1A;">Walker performance</h3>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5E3DB;border-radius:8px;overflow:hidden;">
<tr style="background:#1A4331;color:#fff;"><td style="padding:10px 12px;font-size:12px;">Walker</td><td style="padding:10px 12px;font-size:12px;text-align:right;">Walks</td><td style="padding:10px 12px;font-size:12px;text-align:right;">Minutes</td><td style="padding:10px 12px;font-size:12px;text-align:right;">Rating</td><td style="padding:10px 12px;font-size:12px;text-align:right;">Revenue</td></tr>
${walkerHtml}
</table>`

    await sendEmail({
      to: adminEmails,
      subject: `Rocky's Retreat and Rambles weekly report — ${fmtMoney(totalRevenue)} · ${completedBookings.length} walks · ${pendingBookings} pending`,
      html: wrap(`Weekly KPI report (${weekLabel})`, body, { label: "Open admin dashboard", url: `${APP_URL}/admin` }),
    })
  }

  // ----- Client digests -----
  const byClient = new Map<string, ClientWeeklyWalk[]>()
  const photosByBooking = new Map<string, number>()
  for (const log of photoLogs) {
    // deno-lint-ignore no-explicit-any
    const ll = log as any
    photosByBooking.set(ll.booking_id, (photosByBooking.get(ll.booking_id) || 0) + 1)
  }

  for (const b of completedBookings) {
    // deno-lint-ignore no-explicit-any
    const bb = b as any
    if (!bb.client_id) continue
    const list = byClient.get(bb.client_id) || []
    list.push({
      dogName: dogMap.get(bb.dog_id)?.name || "Your dog",
      date: bb.scheduled_date,
      walkerName: profileMap.get(bb.walker_id || "")?.full_name || "Your walker",
      durationMinutes: bb.duration_minutes || 0,
      photoCount: photosByBooking.get(bb.id) || 0,
    })
    byClient.set(bb.client_id, list)
  }

  let clientEmailsSent = 0
  for (const [cid, walks] of byClient.entries()) {
    const profile = profileMap.get(cid)
    if (!profile?.email || walks.length === 0) continue

    const walkerCount = new Map<string, number>()
    for (const w of walks) walkerCount.set(w.walkerName, (walkerCount.get(w.walkerName) || 0) + 1)
    let favouriteWalker: string | undefined
    let topC = 0
    for (const [n, c] of walkerCount.entries()) { if (c > topC) { topC = c; favouriteWalker = n } }

    const totalPhotosForClient = walks.reduce((s, w) => s + w.photoCount, 0)
    const totalMins = walks.reduce((s, w) => s + w.durationMinutes, 0)
    const walksHtml = walks.map(w => `<tr><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:14px;"><strong>${escapeHtml(w.dogName)}</strong></td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;">${escapeHtml(w.date)}</td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;">${escapeHtml(w.walkerName)}</td><td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.durationMinutes} min</td></tr>`).join("")

    const body = `<p>Hi ${escapeHtml(profile.full_name || "there")}, here's how your pups got on this week.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border:1px solid #E5E3DB;border-radius:8px;overflow:hidden;">
<tr><td style="background:#F9F8F6;padding:14px;text-align:center;width:33%;"><div style="font-size:24px;font-weight:700;color:#1A4331;">${walks.length}</div><div style="font-size:12px;color:#8A8A8A;text-transform:uppercase;">Walks</div></td><td style="background:#F9F8F6;padding:14px;text-align:center;width:33%;border-left:1px solid #E5E3DB;border-right:1px solid #E5E3DB;"><div style="font-size:24px;font-weight:700;color:#1A4331;">${totalMins}</div><div style="font-size:12px;color:#8A8A8A;text-transform:uppercase;">Minutes</div></td><td style="background:#F9F8F6;padding:14px;text-align:center;width:33%;"><div style="font-size:24px;font-weight:700;color:#DDA74F;">${totalPhotosForClient}</div><div style="font-size:12px;color:#8A8A8A;text-transform:uppercase;">Photos</div></td></tr>
</table>
${favouriteWalker ? `<p style="font-size:14px;color:#5C5C5C;">⭐ Favourite walker this week: <strong style="color:#1A4331;">${escapeHtml(favouriteWalker)}</strong></p>` : ""}
<h3 style="margin:24px 0 8px;font-size:15px;color:#1A1A1A;">This week's walks</h3>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5E3DB;border-radius:8px;overflow:hidden;">${walksHtml}</table>`

    await sendEmail({
      to: profile.email,
      subject: `Your Rocky's Retreat and Rambles week: ${walks.length} walk${walks.length !== 1 ? "s" : ""} with ${totalPhotosForClient} photo${totalPhotosForClient !== 1 ? "s" : ""} 🐾`,
      html: wrap(`Your week with Rocky's Retreat and Rambles (${weekLabel})`, body, { label: "View photo gallery", url: `${APP_URL}/client/gallery` }),
    })
    clientEmailsSent += 1
  }

  return {
    ok: true,
    weekLabel,
    adminDigestSentTo: adminEmails.length,
    clientDigestsSent: clientEmailsSent,
    totalWalks: completedBookings.length,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    pendingBookings,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  const authHeader = req.headers.get("Authorization") || ""

  // Path A: cron call with CRON_SECRET
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
    const result = await runDigest()
    return jsonRes(result)
  }

  // Path B: admin user call (requires session JWT)
  if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "Missing Authorization" }, { status: 401 })
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return jsonRes({ error: "Unauthorized" }, { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (me?.role !== "admin") return jsonRes({ error: "Forbidden" }, { status: 403 })

  const result = await runDigest()
  return jsonRes(result)
})
