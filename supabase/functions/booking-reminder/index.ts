// Supabase Edge Function: booking-reminder
// Runs via Supabase Cron (daily) to send a friendly reminder email to every
// client whose CONFIRMED booking starts roughly 24 hours from now.
//
// Behaviour:
//   • Reads the `email_automations` row for template_key='booking_reminder';
//     if disabled, the function no-ops (admin toggles in the Email Center).
//   • Uses any `subject_override` / `html_override` the admin saved, else
//     the bundled default copy.
//   • Only touches bookings with status='confirmed' AND reminder_sent_at IS NULL
//     AND scheduled_date = (today + 1 day). Marks them as reminded so a
//     second cron run in the same day (or manual trigger) cannot double-send.
//   • Writes a single audit_log entry summarising the run.
//
// Auth: scheduled runs authenticate with the CRON_SECRET header.
//       Admin-triggered manual runs authenticate with the admin's JWT.
//
// Secrets: RESEND_API_KEY, SENDER_EMAIL, CRON_SECRET (optional — defaults to
//          Supabase's own service_role_key check for scheduled invocations).
// Supabase auto-provides: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SENDER_EMAIL   = Deno.env.get("SENDER_EMAIL") ?? "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const CRON_SECRET    = Deno.env.get("CRON_SECRET") ?? ""
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(b), { ...init, headers: { "content-type": "application/json", ...CORS, ...(init.headers || {}) } })

const DEFAULT_SUBJECT = "Just a friendly reminder about your upcoming walk"
const DEFAULT_HTML = `<p>This is a quick reminder about your upcoming walk with us.</p>
<p>Please make sure your dog has their lead, collar and any bits we usually take (towel, favourite toy) ready by the door. If anything changes, simply reply to this email or update the booking in your dashboard.</p>
<p>See you soon!<br/>Rocky's Retreat and Rambles</p>`

function wrap(subject: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F9F8F6;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #E5E3DB;overflow:hidden;">
<tr><td style="background:#1A4331;padding:20px 32px;color:#fff;font-size:18px;font-weight:700;">🐾 Rocky's Retreat and Rambles</td></tr>
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:20px;color:#1A4331;">${subject}</h1></td></tr>
<tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#3C3C3C;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;">Rocky's Retreat and Rambles · Please reply to this email if you have any questions.</td></tr>
</table></td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  // --- Auth: either a valid admin JWT OR the CRON_SECRET ------------------
  const authHeader = req.headers.get("Authorization") || ""
  const cronHeader = req.headers.get("x-cron-secret") || ""

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  let authorized = false
  let actorLabel = "cron"
  if (CRON_SECRET && cronHeader === CRON_SECRET) {
    authorized = true
  } else if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (user) {
      const { data: me } = await admin.from("profiles").select("role, full_name, email").eq("id", user.id).maybeSingle()
      if (me?.role === "admin") { authorized = true; actorLabel = me?.full_name || me?.email || user.email || "admin" }
    }
  }
  if (!authorized) return json({ error: "Unauthorized" }, { status: 401 })

  // --- Is the automation enabled? ----------------------------------------
  const { data: auto } = await admin.from("email_automations")
    .select("enabled, subject_override, html_override")
    .eq("template_key", "booking_reminder")
    .maybeSingle()
  if (!auto?.enabled) {
    return json({ ok: true, skipped: "booking_reminder automation is OFF" })
  }
  const subject = (auto.subject_override?.trim() || DEFAULT_SUBJECT) as string
  const html    = (auto.html_override?.trim()    || DEFAULT_HTML) as string

  // --- Find eligible bookings --------------------------------------------
  // "Tomorrow" from the server's perspective (UTC). Booking.scheduled_date is a
  // DATE, so tz doesn't matter within a same-day range.
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
  const tomorrow = d.toISOString().slice(0, 10)

  const { data: bookings, error: bookErr } = await admin
    .from("bookings")
    .select("id, scheduled_date, scheduled_time, walk_type, client_id, client:profiles!bookings_client_id_fkey(full_name, email), dog:dogs(name)")
    .eq("status", "confirmed")
    .eq("scheduled_date", tomorrow)
    .is("reminder_sent_at", null)

  if (bookErr) return json({ error: bookErr.message }, { status: 500 })
  if (!bookings || bookings.length === 0) {
    return json({ ok: true, date: tomorrow, sent: 0, failed: 0, total: 0 })
  }
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, { status: 500 })

  let sent = 0, failed = 0
  const failures: string[] = []
  const markIds: string[] = []

  for (const b of bookings) {
    const email = (b as any).client?.email as string | undefined
    const name  = (b as any).client?.full_name as string | undefined
    if (!email || !email.includes("@")) { failed++; failures.push(`booking ${b.id}: no client email`); continue }

    const dogName = (b as any).dog?.name ? ` for <strong>${(b as any).dog.name}</strong>` : ""
    const timeBit = `${b.scheduled_date}${b.scheduled_time ? ` at ${String(b.scheduled_time).slice(0,5)}` : ""}`
    const greeting = name ? `<p>Hi ${name.split(" ")[0]},</p>` : ""
    const reminderLine = `<p style="background:#E8F0EC;border-left:3px solid #1A4331;padding:10px 14px;margin:0 0 16px;">Your walk${dogName} is booked for <strong>${timeBit}</strong>.</p>`
    const wrapped = wrap(subject, `${greeting}${reminderLine}${html}`)

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: SENDER_EMAIL, to: [email], subject, html: wrapped }),
      })
      if (res.ok) { sent++; markIds.push(b.id) }
      else { failed++; failures.push(`${email}: ${res.status}`) }
    } catch (e) {
      failed++; failures.push(`${email}: ${(e as Error).message}`)
    }
  }

  // Mark reminded so we never double-send.
  if (markIds.length > 0) {
    await admin.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).in("id", markIds)
  }

  // Audit
  try {
    await admin.from("audit_log").insert({
      actor_id: null,
      actor_name: actorLabel,
      actor_email: null,
      action: "booking_reminders_sent",
      target_type: "cron",
      target_id: null,
      target_name: `Reminders for ${tomorrow}`,
      details: { date: tomorrow, sent, failed, total: bookings.length, failures: failures.slice(0, 10) },
    })
  } catch (e) { console.warn("[booking-reminder] audit failed:", e) }

  return json({ ok: true, date: tomorrow, sent, failed, total: bookings.length, failures })
})
