// supabase/functions/db-backup/index.ts
// Weekly database backup — exports the core tables to JSON and emails
// the snapshot as an attachment so the admin always has a recoverable
// copy independent of Supabase's own backups.
//
// Schedule with pg_cron once deployed:
//   SELECT cron.schedule(
//     'weekly-db-backup', '0 3 * * 0',
//     $$ SELECT net.http_post(
//          url:='https://<PROJECT>.functions.supabase.co/db-backup',
//          headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
//        ); $$
//   );

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SENDER_EMAIL = Deno.env.get('SENDER_EMAIL') || 'onboarding@resend.dev'
const BACKUP_DESTINATION_EMAIL = Deno.env.get('BACKUP_DESTINATION_EMAIL')!

// Tables to back up. Add/remove as needed.
const TABLES = [
  'profiles',
  'dogs',
  'bookings',
  'walk_logs',
  'audit_log',
  'notifications',
  'notification_prefs',
  'email_automations',
  'login_history',
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const snapshot: Record<string, any> = { _meta: { generated_at: new Date().toISOString() } }
    const counts: Record<string, number> = {}

    for (const t of TABLES) {
      const { data, error } = await supa.from(t).select('*')
      if (error) {
        snapshot[t] = { _error: error.message }
        counts[t] = -1
      } else {
        snapshot[t] = data
        counts[t] = data?.length || 0
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `rocky-backup-${dateStr}.json`
    const json = JSON.stringify(snapshot, null, 2)
    const base64 = btoa(unescape(encodeURIComponent(json)))

    const summary = TABLES.map(t => `${t}: ${counts[t]} row(s)`).join('<br/>')

    // Email via Resend with the JSON as attachment
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER_EMAIL,
        to: [BACKUP_DESTINATION_EMAIL],
        subject: `Rocky's Retreat backup — ${dateStr}`,
        html: `
          <h2>Weekly database backup</h2>
          <p>Generated: <strong>${new Date().toUTCString()}</strong></p>
          <p>Snapshot summary:</p>
          <pre style="font-size:12px;background:#f5f5f5;padding:10px;border-radius:4px">${summary}</pre>
          <p>Keep this email safe — the attached JSON is the recovery copy.</p>
        `,
        attachments: [{ filename, content: base64 }],
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      throw new Error(`Resend error: ${errText}`)
    }

    return new Response(JSON.stringify({ ok: true, filename, counts }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
