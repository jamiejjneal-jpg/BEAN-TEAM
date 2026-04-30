// Time-off notifications: fire in-app + email when admin acts on a walker's
// time-off record. Kept separate from lib/notify.ts so the call sites stay
// readable and we can batch admin-notifications to the whole admin team.

import { createClient } from '@/lib/supabase/client'

type Kind = 'approved' | 'rejected' | 'admin_created'

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function describeRow(row: any): string {
  const start = fmtDate(row.start_date)
  const end   = row.end_date ? fmtDate(row.end_date) : 'ongoing'
  const datePart =
    row.start_date === row.end_date ? start
    : `${start} → ${end}`
  let recurrence = ''
  if (row.recurrence_type === 'weekly') {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const dow = row.recurrence_weekday ?? new Date(row.start_date).getDay()
    recurrence = ` (weekly on ${days[dow]}s)`
  } else if (row.recurrence_type === 'block' && row.recurrence_block_weeks) {
    recurrence = ` (every ${row.recurrence_block_weeks} week${row.recurrence_block_weeks === 1 ? '' : 's'})`
  }
  return datePart + recurrence
}

function emailBody(kind: Kind, row: any, note?: string | null): { subject: string; html: string; title: string; message: string } {
  const when = describeRow(row)
  const reason = row.reason ? `<p style="margin:0 0 12px;color:#5C5C5C;font-style:italic;">Reason noted: ${row.reason}</p>` : ''
  const noteBlock = note?.trim()
    ? `<p style="margin:16px 0 0;padding:12px 14px;background:#FDF8EF;border-left:3px solid #DDA74F;border-radius:4px;"><strong>Admin note:</strong> ${note}</p>`
    : ''
  if (kind === 'approved') {
    return {
      title: 'Time off approved',
      message: `Your time off ${when} has been approved.`,
      subject: `Your time off is approved — ${when}`,
      html: `<p>Good news — your time off has been <strong style="color:#1A4331;">approved</strong>.</p>
             <p style="margin:0 0 16px;"><strong>Dates:</strong> ${when}</p>
             ${reason}${noteBlock}
             <p style="margin-top:20px;">We'll make sure no walks are assigned to you on those days.</p>`,
    }
  }
  if (kind === 'rejected') {
    return {
      title: 'Time off not approved',
      message: `Your time off ${when} wasn't approved.${note ? ' Reason: ' + note : ''}`,
      subject: `Time off request — needs attention — ${when}`,
      html: `<p>We couldn't approve your time off request for <strong>${when}</strong> this time.</p>
             ${reason}${noteBlock}
             <p style="margin-top:20px;">Please get in touch with admin if you'd like to discuss or submit a different date.</p>`,
    }
  }
  // admin_created
  return {
    title: 'Time off added to your calendar',
    message: `Admin has added time off for you: ${when}.`,
    subject: `Time off added to your schedule — ${when}`,
    html: `<p>Rocky’s admin team has added time off to your schedule.</p>
           <p style="margin:0 0 16px;"><strong>Dates:</strong> ${when}</p>
           ${reason}${noteBlock}
           <p style="margin-top:20px;">No walks will be assigned to you on those days. If anything here looks wrong, let admin know.</p>`,
  }
}

export async function notifyWalkerTimeOff(kind: Kind, row: any, note?: string | null) {
  const supabase = createClient()
  try {
    // Fetch walker email + name for the email delivery
    const { data: walker } = await supabase
      .from('profiles').select('email, full_name').eq('id', row.walker_id).maybeSingle()

    const { subject, html, title, message } = emailBody(kind, row, note)

    // 1) In-app notification (shows on bell + /walker/notifications)
    await supabase.from('notifications').insert({
      user_id: row.walker_id,
      title,
      message,
      type: 'system',
      related_booking_id: null,
      is_read: false,
    })

    // 2) Email — bulk-mail edge function (admin-only endpoint; callers here
    //    must be admin which is enforced by the calling UI).
    if (walker?.email) {
      await supabase.functions.invoke('bulk-mail', {
        body: {
          subject,
          html,
          recipients: [{ email: walker.email, full_name: walker.full_name || '' }],
          audit_name: `[TIME OFF] ${kind}`,
        },
      })
    }
  } catch (e) {
    // Best-effort — never block the originating admin action.
    // eslint-disable-next-line no-console
    console.warn('[notifyWalkerTimeOff] failed:', e)
  }
}

// Fire an in-app ping to every admin when a walker files a new request.
export async function notifyAdminsTimeOffRequested(row: any, walkerName: string | null) {
  const supabase = createClient()
  try {
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true)
    if (!admins || admins.length === 0) return
    const when = describeRow(row)
    const rows = admins.map(a => ({
      user_id: a.id,
      title: 'Time off request',
      message: `${walkerName || 'A walker'} requested time off: ${when}.${row.reason ? ' Reason: ' + row.reason : ''}`,
      type: 'system',
      related_booking_id: null,
      is_read: false,
    }))
    await supabase.from('notifications').insert(rows)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifyAdminsTimeOffRequested] failed:', e)
  }
}
