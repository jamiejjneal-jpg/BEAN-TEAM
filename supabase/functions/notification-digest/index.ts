// Supabase Edge Function: notification-digest
// Runs daily (via pg_cron) at 08:00 UTC. For every user who set
// `digest_mode` to 'daily', rolls up their un-emailed in-app notifications
// from the last 24 hours and sends ONE summary email. On Sundays it also
// runs the weekly roll-up for users on 'weekly'.
//
// Authentication: CRON_SECRET header for scheduled runs (reusing the same
// secret as booking-reminder) OR an admin JWT for manual "run now" triggers.
//
// Silently skips users whose topic email toggles are all off, whose
// paused_until is still in the future, or who have zero pending rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SENDER_EMAIL   = Deno.env.get("SENDER_EMAIL") ?? "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const CRON_SECRET    = Deno.env.get("CRON_SECRET") ?? ""
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(b), { ...init, headers: { "content-type": "application/json", ...CORS, ...(init.headers || {}) } })

function wrap(subject: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F9F8F6;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #E5E3DB;overflow:hidden;">
<tr><td style="background:#1A4331;padding:20px 32px;color:#fff;font-size:18px;font-weight:700;">🐾 Rocky's Retreat and Rambles</td></tr>
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:20px;color:#1A4331;">${subject}</h1></td></tr>
<tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#3C3C3C;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;">Want different emails? Update your preferences at <a href="#" style="color:#1A4331">Notifications settings</a>.</td></tr>
</table></td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  const authHeader = req.headers.get("Authorization") || ""
  const cronHeader = req.headers.get("x-cron-secret") || ""
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  // Read body early — "preview" mode lets any authenticated user fetch their
  // own rendered digest HTML without sending any email. Scheduled and admin
  // runs send emails as usual.
  let reqBody: any = {}
  try { reqBody = await req.clone().json() } catch { /* empty body on cron runs */ }

  let authorized = false
  let previewUserId: string | null = null
  if (CRON_SECRET && cronHeader === CRON_SECRET) {
    authorized = true
  } else if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (user) {
      const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
      if (me?.role === "admin") authorized = true
      if (reqBody?.preview === true) {
        authorized = true
        previewUserId = user.id
      }
    }
  }
  if (!authorized) return json({ error: "Unauthorized" }, { status: 401 })
  if (!RESEND_API_KEY && !previewUserId) return json({ error: "RESEND_API_KEY not configured" }, { status: 500 })

  // Which modes should run? Always run 'daily'. Run 'weekly' only on Sunday.
  const now = new Date()
  const runWeekly = now.getUTCDay() === 0
  const modes = runWeekly ? ["daily", "weekly"] : ["daily"]

  // ---- PREVIEW MODE --------------------------------------------------
  // Any authenticated user can fetch a preview of what their NEXT digest
  // would look like (using the last 24h / 7 days of their notifications).
  // No DB writes, no email sent.
  if (previewUserId) {
    const requestedMode = (reqBody?.mode === 'weekly' ? 'weekly' : 'daily')
    const { data: p } = await admin.from("notification_prefs")
      .select("user_id, digest_mode, paused_until, email_booking, email_walk_update, email_photo_added, email_review, email_system")
      .eq("user_id", previewUserId).maybeSingle()
    const enabledKinds = new Set<string>()
    if (p?.email_booking)     enabledKinds.add("booking")
    if (p?.email_walk_update) enabledKinds.add("walk_update")
    if (p?.email_photo_added) enabledKinds.add("photo_added")
    if (p?.email_review)      enabledKinds.add("review")
    if (p?.email_system)      enabledKinds.add("system")
    // If no topics are enabled yet, still preview ALL of them so the user
    // can see what the format looks like before toggling things on.
    const showAll = enabledKinds.size === 0
    const since = (() => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - (requestedMode === "weekly" ? 7 : 1))
      return d.toISOString()
    })()
    const { data: rows } = await admin.from("notifications")
      .select("id, title, message, type, created_at")
      .eq("user_id", previewUserId)
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(100)
    const toSend = (rows || []).filter(r => showAll || enabledKinds.has(r.type))
    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", previewUserId).maybeSingle()
    const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "there"
    const modeLabel = requestedMode === "weekly" ? "Your week in walks" : "Your day in walks"

    if (toSend.length === 0) {
      const empty = wrap(modeLabel, `<p>Hi ${firstName},</p><p>No activity in the last ${requestedMode === "weekly" ? "7 days" : "24 hours"}. A real digest will look like this whenever there&apos;s news to share.</p>`)
      return json({ ok: true, preview: true, subject: modeLabel, html: empty, count: 0, showAll })
    }

    const byKind: Record<string, typeof toSend> = {}
    for (const r of toSend) { (byKind[r.type] = byKind[r.type] || []).push(r) }
    const labels: Record<string, string> = {
      booking: "Bookings", walk_update: "Walk updates", photo_added: "New photos", review: "Reviews", system: "Account & security",
    }
    const sections = Object.entries(byKind).map(([k, list]) => {
      const items = list.slice(0, 8).map(r => `<li style="margin:4px 0"><strong>${r.title}</strong><br/><span style="color:#5C5C5C;font-size:13px">${r.message}</span></li>`).join("")
      const more = list.length > 8 ? `<li style="color:#8A8A8A;font-size:12px">…and ${list.length - 8} more</li>` : ""
      return `<h3 style="margin:18px 0 6px;font-size:15px;color:#1A4331">${labels[k] || k} <span style="color:#8A8A8A;font-weight:400">(${list.length})</span></h3><ul style="padding-left:18px;margin:0">${items}${more}</ul>`
    }).join("")
    const intro = `<p>Hi ${firstName},</p><p>This is what your <strong>${requestedMode}</strong> digest will look like based on the last ${requestedMode === "weekly" ? "7 days" : "24 hours"} of activity:</p>`
    const html = wrap(modeLabel, `${intro}${sections}${showAll ? `<p style="margin-top:16px;padding:10px;background:#FDF8EF;border-radius:6px;font-size:12px;color:#7A5A1C">You currently have every email topic turned OFF — this preview shows what a digest would look like with them all on.</p>` : ''}`)
    return json({ ok: true, preview: true, subject: modeLabel, html, count: toSend.length, showAll })
  }
  // ---- END PREVIEW MODE ---------------------------------------------

  // Fetch all pref rows where digest_mode is daily/weekly and at least one
  // email topic is on.
  const { data: prefsRows } = await admin
    .from("notification_prefs")
    .select("user_id, digest_mode, paused_until, email_booking, email_walk_update, email_photo_added, email_review, email_system")
    .in("digest_mode", modes)

  if (!prefsRows || prefsRows.length === 0) {
    return json({ ok: true, users: 0, sent: 0, failed: 0 })
  }

  const cutoff = (mode: string) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (mode === "weekly" ? 7 : 1))
    return d.toISOString()
  }

  let sent = 0, failed = 0, skipped = 0
  const failures: string[] = []

  for (const p of prefsRows as any[]) {
    try {
      if (p.paused_until && new Date(p.paused_until).getTime() > Date.now()) { skipped++; continue }

      const enabledKinds = new Set<string>()
      if (p.email_booking)     enabledKinds.add("booking")
      if (p.email_walk_update) enabledKinds.add("walk_update")
      if (p.email_photo_added) enabledKinds.add("photo_added")
      if (p.email_review)      enabledKinds.add("review")
      if (p.email_system)      enabledKinds.add("system")
      if (enabledKinds.size === 0) { skipped++; continue }

      const since = cutoff(p.digest_mode)
      const { data: rows } = await admin
        .from("notifications")
        .select("id, title, message, type, created_at")
        .eq("user_id", p.user_id)
        .is("emailed_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100)

      const toSend = (rows || []).filter(r => enabledKinds.has(r.type))
      if (toSend.length === 0) { skipped++; continue }

      const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", p.user_id).maybeSingle()
      if (!profile?.email) { skipped++; continue }

      const firstName = profile.full_name ? profile.full_name.split(" ")[0] : "there"
      const modeLabel = p.digest_mode === "weekly" ? "Your week in walks" : "Your day in walks"
      const intro = `<p>Hi ${firstName},</p><p>Here&apos;s a quick ${p.digest_mode === "weekly" ? "weekly" : "daily"} roundup of what&apos;s happened on your Rocky&apos;s account:</p>`

      const byKind: Record<string, typeof toSend> = {}
      for (const r of toSend) { (byKind[r.type] = byKind[r.type] || []).push(r) }
      const labels: Record<string, string> = {
        booking: "Bookings", walk_update: "Walk updates", photo_added: "New photos", review: "Reviews", system: "Account & security",
      }

      const sections = Object.entries(byKind).map(([k, list]) => {
        const items = list.slice(0, 8).map(r => `<li style="margin:4px 0"><strong>${r.title}</strong><br/><span style="color:#5C5C5C;font-size:13px">${r.message}</span></li>`).join("")
        const more = list.length > 8 ? `<li style="color:#8A8A8A;font-size:12px">…and ${list.length - 8} more</li>` : ""
        return `<h3 style="margin:18px 0 6px;font-size:15px;color:#1A4331">${labels[k] || k} <span style="color:#8A8A8A;font-weight:400">(${list.length})</span></h3><ul style="padding-left:18px;margin:0">${items}${more}</ul>`
      }).join("")

      const html = wrap(modeLabel, `${intro}${sections}<p style="margin-top:20px">Open your dashboard for the full picture — you can also change this to instant emails anytime in your Notifications settings.</p>`)

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: SENDER_EMAIL, to: [profile.email], subject: modeLabel, html }),
      })
      if (!res.ok) {
        failed++; failures.push(`${profile.email}: ${res.status}`)
        continue
      }

      await admin.from("notifications")
        .update({ emailed_at: new Date().toISOString() })
        .in("id", toSend.map(r => r.id))

      sent++
    } catch (e) {
      failed++; failures.push(`user ${p.user_id}: ${(e as Error).message}`)
    }
  }

  try {
    await admin.from("audit_log").insert({
      actor_id: null,
      actor_name: "cron",
      actor_email: null,
      action: "notification_digest_sent",
      target_type: "cron",
      target_id: null,
      target_name: `Digest (${modes.join(",")})`,
      details: { users_processed: prefsRows.length, sent, failed, skipped, failures: failures.slice(0, 10) },
    })
  } catch { /* best-effort */ }

  return json({ ok: true, modes, sent, failed, skipped, failures })
})
