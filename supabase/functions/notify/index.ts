// Supabase Edge Function: notify
// Sends transactional emails for booking + walk events via Resend.
// Client invokes via `supabase.functions.invoke('notify', { body: {...} })`.
//
// Required secrets (set with `supabase secrets set --project-ref <ref>`):
//   RESEND_API_KEY       Resend API key
//   SENDER_EMAIL         e.g. "Rocky's Retreat and Rambles <onboarding@resend.dev>"
//   APP_URL              e.g. "https://ink-validator.emergent.host"
// Supabase auto-provides:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

// @deno-types="npm:@types/node"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const APP_URL = Deno.env.get("APP_URL") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...CORS, ...(init.headers || {}) },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br/>")
}

async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  if (!RESEND_API_KEY) {
    console.warn("[notify] RESEND_API_KEY not set; skipping", opts.subject)
    return { skipped: "no-api-key" as const }
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SENDER_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error("[notify] resend failed:", res.status, txt)
    return { error: `resend ${res.status}: ${txt}` }
  }
  return { ok: true as const }
}

function wrap(headline: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const ctaHtml = cta ? `
    <tr><td style="padding:24px 32px 8px;">
      <a href="${cta.url}" style="display:inline-block;background:#1A4331;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,Helvetica,sans-serif;">${cta.label}</a>
    </td></tr>` : ""

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F9F8F6;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #E5E3DB;overflow:hidden;">
        <tr><td style="background:#1A4331;padding:20px 32px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">
          🐾 Rocky's Retreat and Rambles
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1A4331;">${headline}</h1>
        </td></tr>
        <tr><td style="padding:0 32px 20px;font-size:15px;line-height:1.6;color:#3C3C3C;">
          ${bodyHtml}
        </td></tr>
        ${ctaHtml}
        <tr><td style="padding:24px 32px 28px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;">
          You're receiving this email from Rocky's Retreat and Rambles. Questions? Just reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// deno-lint-ignore no-explicit-any
type Booking = any

async function handleEvent(event: string, b: Booking, extras: { admin_note?: string; reject_reason?: string }, admin: ReturnType<typeof createClient>) {
  switch (event) {
    case "admin_new_booking": {
      const { data: admins } = await admin
        .from("profiles").select("email").eq("role", "admin").eq("is_active", true)
      // deno-lint-ignore no-explicit-any
      const to = (admins || []).map((a: any) => a.email).filter(Boolean)
      if (to.length === 0) return { ok: true, skipped: "no-admins" }
      const body = `
        <p><strong>${escapeHtml(b.client?.full_name || "A client")}</strong> has requested a new walk for <strong>${escapeHtml(b.dog?.name || "a dog")}</strong>.</p>
        <table role="presentation" cellpadding="6" cellspacing="0" style="margin:16px 0;font-size:14px;">
          <tr><td style="color:#8A8A8A;">Date:</td><td>${escapeHtml(b.scheduled_date)}</td></tr>
          <tr><td style="color:#8A8A8A;">Time:</td><td>${escapeHtml(b.scheduled_time)}</td></tr>
          <tr><td style="color:#8A8A8A;">Type:</td><td style="text-transform:capitalize;">${escapeHtml(b.walk_type || "")}</td></tr>
          ${b.notes ? `<tr><td style="color:#8A8A8A;vertical-align:top;">Notes:</td><td>${escapeHtml(b.notes)}</td></tr>` : ""}
        </table>
        <p>Please review, assign a walker, and approve or decline the request.</p>`
      return sendEmail({
        to,
        subject: `New walk request: ${b.dog?.name || "dog"} on ${b.scheduled_date}`,
        html: wrap("New booking awaiting approval", body, { label: "Review booking", url: `${APP_URL}/admin/bookings` }),
      })
    }

    case "client_booking_approved": {
      if (!b.client?.email) return { ok: true, skipped: "no-client-email" }
      const body = `
        <p>Hi ${escapeHtml(b.client?.full_name || "there")}, great news — your walk for <strong>${escapeHtml(b.dog?.name || "your dog")}</strong> on <strong>${escapeHtml(b.scheduled_date)} at ${escapeHtml(b.scheduled_time)}</strong> has been confirmed${b.walker?.full_name ? ` with <strong>${escapeHtml(b.walker.full_name)}</strong>` : ""}.</p>
        ${extras.admin_note ? `<p style="background:#FDF8EF;border-left:3px solid #DDA74F;padding:12px 14px;border-radius:4px;"><strong>Note from the team:</strong><br/>${escapeHtml(extras.admin_note)}</p>` : ""}
        <p>We'll send you another email when your walker picks up ${escapeHtml(b.dog?.name || "your dog")}.</p>`
      return sendEmail({
        to: b.client.email,
        subject: `Booking confirmed: ${b.dog?.name || "dog"} on ${b.scheduled_date}`,
        html: wrap("Your walk is confirmed 🐾", body, { label: "View booking", url: `${APP_URL}/client/bookings` }),
      })
    }

    case "client_booking_rejected": {
      if (!b.client?.email) return { ok: true, skipped: "no-client-email" }
      const body = `
        <p>Hi ${escapeHtml(b.client?.full_name || "there")}, unfortunately we're unable to accommodate your walk for <strong>${escapeHtml(b.dog?.name || "your dog")}</strong> on <strong>${escapeHtml(b.scheduled_date)}</strong>.</p>
        <p style="background:#FDEDEA;border-left:3px solid #E06D53;padding:12px 14px;border-radius:4px;"><strong>Reason:</strong><br/>${escapeHtml(extras.reject_reason || "Please contact us for more details.")}</p>
        <p>Please head back to the app to book a different slot — we'd love to walk ${escapeHtml(b.dog?.name || "your dog")} another time.</p>`
      return sendEmail({
        to: b.client.email,
        subject: `Booking update: unable to confirm ${b.dog?.name || "dog"} on ${b.scheduled_date}`,
        html: wrap("Booking couldn't be confirmed", body, { label: "Book another slot", url: `${APP_URL}/client/book` }),
      })
    }

    case "client_pickup": {
      if (!b.client?.email) return { ok: true, skipped: "no-client-email" }
      const body = `
        <p>Hi ${escapeHtml(b.client?.full_name || "there")} — quick update:</p>
        <p style="font-size:17px;"><strong>${escapeHtml(b.walker?.full_name || "Your walker")} has just picked up ${escapeHtml(b.dog?.name || "your dog")} 🐕</strong></p>
        <p>The walk has started. You'll get another email when ${escapeHtml(b.dog?.name || "your dog")} is safely back home.</p>`
      return sendEmail({
        to: b.client.email,
        subject: `${b.dog?.name || "Your dog"} has been picked up 🐾`,
        html: wrap(`${b.dog?.name || "Your dog"} is off on their walk`, body, { label: "View walk details", url: `${APP_URL}/client/bookings` }),
      })
    }

    case "client_dropoff": {
      if (!b.client?.email) return { ok: true, skipped: "no-client-email" }
      const body = `
        <p>Hi ${escapeHtml(b.client?.full_name || "there")},</p>
        <p style="font-size:17px;"><strong>${escapeHtml(b.dog?.name || "Your dog")} is safely home 🏠</strong></p>
        <p>${escapeHtml(b.walker?.full_name || "Your walker")} has just dropped ${escapeHtml(b.dog?.name || "your dog")} off. Check the photo gallery in the app to see how the walk went!</p>`
      return sendEmail({
        to: b.client.email,
        subject: `${b.dog?.name || "Your dog"} is safely home 🏠`,
        html: wrap(`${b.dog?.name || "Your dog"} is back home`, body, { label: "See walk photos", url: `${APP_URL}/client/gallery` }),
      })
    }

    default:
      return { error: `Unknown event: ${event}` }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 })

  const authHeader = req.headers.get("Authorization") || ""
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, { status: 401 })
  }

  // Verify the JWT belongs to a real user by calling auth.getUser with their token.
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: "Unauthorized" }, { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: { event?: string; booking_id?: string; admin_note?: string; reject_reason?: string }
  try { body = await req.json() } catch { return json({ error: "Invalid JSON" }, { status: 400 }) }

  const { event, booking_id, admin_note, reject_reason } = body
  if (!event || !booking_id) return json({ error: "event and booking_id required" }, { status: 400 })

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, client_id, walker_id, scheduled_date, scheduled_time, walk_type, notes, client:profiles!bookings_client_id_fkey(full_name, email), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name)")
    .eq("id", booking_id)
    .maybeSingle()
  if (bErr || !booking) return json({ error: "Booking not found" }, { status: 404 })

  // Role-based authorisation
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = me?.role
  // deno-lint-ignore no-explicit-any
  const b = booking as any

  const allowed = (
    (event === "admin_new_booking" && user.id === b.client_id) ||
    (event === "client_booking_approved" && role === "admin") ||
    (event === "client_booking_rejected" && role === "admin") ||
    (event === "client_pickup" && user.id === b.walker_id) ||
    (event === "client_dropoff" && user.id === b.walker_id)
  )
  if (!allowed) return json({ error: "Forbidden" }, { status: 403 })

  const result = await handleEvent(event, b, { admin_note, reject_reason }, admin)
  return json(result)
})
