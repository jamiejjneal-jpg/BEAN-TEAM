// Supabase Edge Function: admin-ops
// Privileged operations only admins can perform: create admin, change a
// user's role (admin ↔ walker ↔ client), delete any user.
//
// Client invokes via:
//   supabase.functions.invoke('admin-ops', { body: { op: 'create_admin', ... } })
//
// Secrets: RESEND_API_KEY, SENDER_EMAIL, APP_URL (for welcome email only)
// Supabase auto-provides: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const APP_URL = Deno.env.get("APP_URL") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const VALID_ROLES = new Set(["admin", "walker", "client"])

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const jsonRes = (b: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(b), { ...init, headers: { "content-type": "application/json", ...CORS, ...(init.headers || {}) } })

async function sendWelcomeEmail(to: string, fullName: string, resetLink: string) {
  if (!RESEND_API_KEY) return
  const body = `<p>Hi ${fullName || "there"},</p>
<p>You've been added as an administrator on <strong>Rocky's Retreat and Rambles</strong>. Set your password using the secure link below (valid for 1 hour).</p>`
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F9F8F6;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #E5E3DB;overflow:hidden;"><tr><td style="background:#1A4331;padding:20px 32px;color:#fff;font-size:18px;font-weight:700;">🐾 Rocky's Retreat and Rambles</td></tr><tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:22px;color:#1A4331;">Welcome to the team 👋</h1></td></tr><tr><td style="padding:0 32px 20px;font-size:15px;line-height:1.6;color:#3C3C3C;">${body}</td></tr><tr><td style="padding:24px 32px 8px;"><a href="${resetLink}" style="display:inline-block;background:#1A4331;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Set my password</a></td></tr><tr><td style="padding:24px 32px 28px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;">Questions? Just reply to this email.</td></tr></table></td></tr></table></body></html>`
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER_EMAIL, to: [to], subject: "Welcome to Rocky's Retreat and Rambles - set your password", html }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, { status: 405 })

  const authHeader = req.headers.get("Authorization") || ""
  if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "Missing Authorization" }, { status: 401 })

  // Verify caller is an authenticated admin
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return jsonRes({ error: "Unauthorized" }, { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: me } = await admin.from("profiles").select("role, full_name, email").eq("id", user.id).maybeSingle()
  if (me?.role !== "admin") return jsonRes({ error: "Forbidden — admin only" }, { status: 403 })

  async function writeAudit(action: string, target_type: string, target_id: string | null, target_name: string | null, details: Record<string, unknown> | null) {
    try {
      await admin.from("audit_log").insert({
        actor_id: user!.id,
        actor_name: me?.full_name || null,
        actor_email: me?.email || user!.email || null,
        action, target_type, target_id, target_name, details,
      })
    } catch (e) { console.warn("[admin-ops] audit failed:", e) }
  }

  // deno-lint-ignore no-explicit-any
  let body: any
  try { body = await req.json() } catch { return jsonRes({ error: "Invalid JSON" }, { status: 400 }) }

  const { op } = body as { op?: string }
  if (!op) return jsonRes({ error: "op is required" }, { status: 400 })

  switch (op) {
    case "create_admin": {
      const { email, password, full_name, phone } = body
      if (!email || !password || !full_name) return jsonRes({ error: "email, password and full_name required" }, { status: 400 })
      if (password.length < 8) return jsonRes({ error: "Password must be at least 8 characters" }, { status: 400 })

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, role: "admin", phone: phone || "" },
      })
      if (createErr || !created?.user) return jsonRes({ error: createErr?.message || "Failed to create user" }, { status: 400 })

      await admin.from("profiles").upsert({
        id: created.user.id, email, full_name, role: "admin", phone: phone || "", is_active: true,
      }, { onConflict: "id" })

      // Generate password reset link + send welcome email (fire-and-forget)
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery", email,
        options: { redirectTo: `${APP_URL}/auth/callback?next=/reset-password` },
      })
      const resetLink = linkData?.properties?.action_link || `${APP_URL}/forgot-password`
      sendWelcomeEmail(email, full_name, resetLink).catch(() => {})

      await writeAudit("admin_created", "user", created.user.id, full_name || email, { email, phone: phone || null })
      return jsonRes({ ok: true, id: created.user.id })
    }

    case "change_role": {
      const { user_id, new_role } = body as { user_id?: string; new_role?: string }
      if (!user_id || !new_role) return jsonRes({ error: "user_id and new_role required" }, { status: 400 })
      if (!VALID_ROLES.has(new_role)) return jsonRes({ error: "new_role must be admin, walker, or client" }, { status: 400 })
      if (user_id === user.id && new_role !== "admin") {
        return jsonRes({ error: "You cannot demote yourself — ask another admin to do it" }, { status: 400 })
      }

      // Safety: prevent removing the last admin
      if (new_role !== "admin") {
        const { data: target } = await admin.from("profiles").select("role").eq("id", user_id).maybeSingle()
        if (target?.role === "admin") {
          const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true)
          if ((count || 0) <= 1) return jsonRes({ error: "Cannot demote the last active admin" }, { status: 400 })
        }
      }

      const { error: updErr } = await admin.from("profiles").update({ role: new_role }).eq("id", user_id)
      if (updErr) return jsonRes({ error: updErr.message }, { status: 500 })

      // Also update auth user_metadata so middleware/router routes them correctly after next login
      await admin.auth.admin.updateUserById(user_id, { user_metadata: { role: new_role } }).catch(() => {})

      // If promoted to walker, ensure walker_profiles row exists
      if (new_role === "walker") {
        await admin.from("walker_profiles").upsert({ id: user_id }, { onConflict: "id" }).catch(() => {})
      }

      const { data: tgt } = await admin.from("profiles").select("full_name, email, role").eq("id", user_id).maybeSingle()
      await writeAudit("role_changed", "user", user_id, tgt?.full_name || tgt?.email || user_id, { from: (tgt as any)?.role, to: new_role })
      return jsonRes({ ok: true })
    }

    case "delete_user": {
      const { user_id } = body as { user_id?: string }
      if (!user_id) return jsonRes({ error: "user_id required" }, { status: 400 })
      if (user_id === user.id) return jsonRes({ error: "You cannot delete yourself" }, { status: 400 })

      // Prevent deleting the last admin
      const { data: target } = await admin.from("profiles").select("role, full_name, email").eq("id", user_id).maybeSingle()
      if (target?.role === "admin") {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true)
        if ((count || 0) <= 1) return jsonRes({ error: "Cannot delete the last active admin" }, { status: 400 })
      }

      // Defensive cleanup: null / cascade child rows that historically used
      // RESTRICT foreign keys, so delete succeeds even if the SQL migration
      // `supabase_fk_ondelete_migration.sql` has not been applied yet.
      // Policy: keep bookings/walks/reviews (null the refs), remove dogs +
      // walker profile + payouts + notifications.
      try {
        await admin.from("bookings").update({ walker_id: null }).eq("walker_id", user_id)
        await admin.from("bookings").update({ client_id: null }).eq("client_id", user_id)
        await admin.from("walk_logs").update({ walker_id: null }).eq("walker_id", user_id)
        await admin.from("reviews").update({ walker_id: null }).eq("walker_id", user_id)
        await admin.from("reviews").update({ client_id: null }).eq("client_id", user_id)
        await admin.from("walker_payouts").update({ paid_by: null }).eq("paid_by", user_id)
        await admin.from("walker_payouts").delete().eq("walker_id", user_id)
        await admin.from("walker_profiles").delete().eq("id", user_id)
        await admin.from("notifications").delete().eq("user_id", user_id)
        // Dogs belonging to a deleted client are removed (per product decision).
        // Try both possible column names (schema evolved between versions).
        await admin.from("dogs").delete().eq("client_id", user_id).catch(() => {})
        await admin.from("dogs").delete().eq("owner_id", user_id).catch(() => {})
      } catch (e) {
        console.warn("[admin-ops] pre-delete cleanup warning:", e)
      }

      // Delete auth user (cascades via FK to profile if configured, but delete profile too just in case)
      const { error: delAuthErr } = await admin.auth.admin.deleteUser(user_id)
      if (delAuthErr && !String(delAuthErr.message || "").toLowerCase().includes("not found")) {
        return jsonRes({ error: delAuthErr.message }, { status: 500 })
      }
      await admin.from("profiles").delete().eq("id", user_id).catch(() => {})

      await writeAudit("user_deleted", "user", user_id, target?.full_name || target?.email || user_id, { email: target?.email, role: target?.role })
      return jsonRes({ ok: true, deleted: target?.full_name || target?.email || user_id })
    }

    default:
      return jsonRes({ error: `Unknown op: ${op}` }, { status: 400 })
  }
})
