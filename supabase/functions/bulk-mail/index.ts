// Supabase Edge Function: bulk-mail
// Admin-only. Sends personalised email via Resend with optional PDF attachments.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SENDER_EMAIL   = Deno.env.get("SENDER_EMAIL") ?? "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(b), { ...init, headers: { "content-type": "application/json", ...CORS, ...(init.headers || {}) } })

function wrap(subject: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F9F8F6;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #E5E3DB;overflow:hidden;">
<tr><td style="background:#1A4331;padding:20px 32px;color:#fff;font-size:18px;font-weight:700;">Rocky's Retreat and Rambles</td></tr>
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:20px;color:#1A4331;">${subject}</h1></td></tr>
<tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#3C3C3C;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;">Rocky's Retreat and Rambles. Please reply to this email if you have any questions.</td></tr>
</table></td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 })

  const authHeader = req.headers.get("Authorization") || ""
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: "Unauthorized" }, { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: me } = await admin.from("profiles").select("role, full_name, email").eq("id", user.id).maybeSingle()

  let body: any
  try { body = await req.json() } catch { return json({ error: "Invalid JSON" }, { status: 400 }) }

  const { subject, html, recipients, audit_name, auto_template_key, attachments } = body as {
    subject?: string
    html?: string
    audit_name?: string
    auto_template_key?: string
    recipients?: { email?: string; full_name?: string }[]
    attachments?: { filename: string; content: string; contentType?: string }[]
  }

  const isAutomation = !!auto_template_key
  if (!isAutomation && me?.role !== "admin") {
    return json({ error: "Forbidden: admin only" }, { status: 403 })
  }
  if (isAutomation) {
    if (!Array.isArray(recipients) || recipients.length !== 1) {
      return json({ error: "Automation calls must target exactly one recipient" }, { status: 400 })
    }
    const to = (recipients[0]?.email || "").toLowerCase()
    if (me?.role !== "admin" && to !== (user.email || "").toLowerCase()) {
      return json({ error: "Automation calls can only send to your own email" }, { status: 403 })
    }
  }

  let effSubject = subject
  let effHtml    = html
  let effAuditName = audit_name
  if (auto_template_key) {
    const { data: row } = await admin.from("email_automations")
      .select("enabled, subject_override, html_override")
      .eq("template_key", auto_template_key)
      .maybeSingle()
    if (!row?.enabled) return json({ ok: true, skipped: `automation ${auto_template_key} is OFF` })
    effSubject = (row.subject_override?.trim() || subject) as string
    effHtml    = (row.html_override?.trim()    || html) as string
    effAuditName = `[AUTO] ${auto_template_key}`
  }

  if (!effSubject || !effHtml) return json({ error: "subject and html are required" }, { status: 400 })
  if (!Array.isArray(recipients) || recipients.length === 0) return json({ error: "recipients must be a non-empty array" }, { status: 400 })
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured on the edge function" }, { status: 500 })

  const valid = recipients.filter(r => r && typeof r.email === "string" && r.email.includes("@"))
  if (valid.length === 0) return json({ error: "No valid email addresses in recipients" }, { status: 400 })

  let sent = 0, failed = 0
  const failures: string[] = []
  for (const r of valid) {
    const greeting = r.full_name ? `<p>Hi ${r.full_name.split(" ")[0]},</p>` : ""
    const wrapped = wrap(effSubject!, `${greeting}${effHtml!}`)
    try {
      const payload: any = { from: SENDER_EMAIL, to: [r.email], subject: effSubject, html: wrapped }
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments.map(a => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType || "application/octet-stream",
        }))
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) sent++
      else { failed++; failures.push(`${r.email}: ${res.status}`) }
    } catch (e) {
      failed++; failures.push(`${r.email}: ${(e as Error).message}`)
    }
  }

  try {
    await admin.from("audit_log").insert({
      actor_id: user.id,
      actor_name: me?.full_name || null,
      actor_email: me?.email || user.email || null,
      action: "email_sent",
      target_type: "email",
      target_id: null,
      target_name: effAuditName || effSubject,
      details: { subject: effSubject, recipients_count: valid.length, sent, failed, failures: failures.slice(0, 10) },
    })
  } catch (e) { console.warn("bulk-mail audit failed:", e) }

  return json({ ok: true, sent, failed, total: valid.length, failures })
})
