// Lightweight client-side helper that fires a single-recipient "automation"
// email whenever a specific trigger happens (e.g. new client added).
//
// Design: we DO NOT read `email_automations` from the browser — the table is
// locked down to admins only by RLS. Instead we hand the decision to the
// `bulk-mail` edge function which:
//   • Runs under the service role and can read the toggle.
//   • Looks up the saved subject/html overrides.
//   • Sends via Resend.
//   • No-ops (returns ok:true, skipped) if the toggle is OFF.
//
// The browser only ships a template_key + recipient. Safe for self-signup
// flows where the user is a client (not an admin).

import { createClient } from '@/lib/supabase/client'

export type AutoKey = 'welcome_client' | 'welcome_walker' | 'leaving_client' | 'leaving_walker' | 'booking_reminder'

type Recipient = { email: string; full_name?: string | null }

export async function triggerAutoEmail(autoKey: AutoKey, recipient: Recipient): Promise<void> {
  if (!recipient?.email) return
  const supabase = createClient()
  try {
    await supabase.functions.invoke('bulk-mail', {
      body: {
        auto_template_key: autoKey,
        recipients: [{ email: recipient.email, full_name: recipient.full_name || '' }],
      },
    })
  } catch (e) {
    // Swallow — never block the calling flow for a cosmetic email.
    // eslint-disable-next-line no-console
    console.warn('[autoEmail] failed:', e)
  }
}
