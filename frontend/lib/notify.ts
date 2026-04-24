import { createClient } from '@/lib/supabase/client'

// Invokes the Supabase Edge Function `notify` to send a transactional email
// (booking approved/rejected, pickup, dropoff, admin new-booking alert).
// Always fire-and-forget: failures are logged, never surfaced to the user.
export async function notify(event: string, body: { booking_id: string; admin_note?: string; reject_reason?: string }) {
  try {
    const supabase = createClient()
    const { error } = await supabase.functions.invoke('notify', {
      body: { event, ...body },
    })
    if (error) console.warn('[notify] edge function failed:', error.message || error)
  } catch (e) {
    console.warn('[notify] exception:', e)
  }
}


// -------------------------------------------------------------------
// Preference-aware in-app + optional email notifications.
// Used for anything that isn't a core booking lifecycle event (those
// still go through the `notify` edge function above).
// -------------------------------------------------------------------

type Kind = 'booking' | 'walk_update' | 'photo_added' | 'review' | 'system'

export type NotifyInput = {
  kind: Kind
  toUserId: string
  toEmail?: string | null
  toName?: string | null
  title: string
  message: string
  emailHtml?: string
  emailSubject?: string
  related_booking_id?: string | null
}

export async function sendNotification(n: NotifyInput): Promise<void> {
  const supabase = createClient()
  try {
    const { data: prefsRow } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', n.toUserId)
      .maybeSingle()
    const prefs = (prefsRow || {}) as Record<string, any>

    const pausedUntil = prefs.paused_until ? new Date(prefs.paused_until).getTime() : 0
    const isPaused = pausedUntil > Date.now()

    // Defaults match the SQL defaults when no prefs row exists yet.
    const inappOn = !isPaused && (prefs[`inapp_${n.kind}`] ?? true)
    const emailOn = !isPaused && (prefs[`email_${n.kind}`] ?? (n.kind === 'booking' || n.kind === 'system'))

    if (inappOn) {
      await supabase.from('notifications').insert({
        user_id: n.toUserId,
        title:   n.title,
        message: n.message,
        type:    n.kind,
        related_booking_id: n.related_booking_id || null,
        is_read: false,
      })
    }

    // Digest mode: only send instant emails when the user has opted in.
    // Otherwise the daily/weekly cron picks up the in-app row above and
    // rolls it into a single summary email.
    const digestMode = (prefs.digest_mode as string) || 'instant'
    if (emailOn && n.toEmail && digestMode === 'instant') {
      await supabase.functions.invoke('bulk-mail', {
        body: {
          subject: n.emailSubject || n.title,
          html:    n.emailHtml    || `<p>${n.message}</p>`,
          recipients: [{ email: n.toEmail, full_name: n.toName || '' }],
          audit_name: `[NOTIFY] ${n.kind} — ${n.title}`,
        },
      })
      // Mark the most recent row for this user/kind as emailed, so the
      // digest cron won't re-send the same event.
      await supabase.from('notifications')
        .update({ emailed_at: new Date().toISOString() })
        .eq('user_id', n.toUserId)
        .eq('type', n.kind)
        .is('emailed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .catch(() => {})
    }
  } catch (e) {
    // Best-effort — never block the originating flow.
    // eslint-disable-next-line no-console
    console.warn('[sendNotification] failed:', e)
  }
}
