import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const sender = process.env.SENDER_EMAIL || "Rocky's Retreat and Rambles <onboarding@resend.dev>"
const appUrl = process.env.APP_URL || 'https://ink-validator.emergent.host'

let resendClient: Resend | null = null
function getClient(): Resend | null {
  if (!apiKey) return null
  if (!resendClient) resendClient = new Resend(apiKey)
  return resendClient
}

// Fire-and-forget sender — never throws, just logs. Email failures must not
// break the user flow they were attached to.
async function send(opts: { to: string | string[]; subject: string; html: string }) {
  const client = getClient()
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set; skipping email', opts.subject)
    return
  }
  try {
    const { error } = await client.emails.send({
      from: sender,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    })
    if (error) console.error('[email] send failed:', error)
  } catch (e) {
    console.error('[email] send exception:', e)
  }
}

// ---- Shared layout ------------------------------------------------------

function wrap(headline: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const ctaHtml = cta ? `
    <tr><td style="padding:24px 32px 8px;">
      <a href="${cta.url}" style="display:inline-block;background:#1A4331;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;font-family:Arial,Helvetica,sans-serif;">${cta.label}</a>
    </td></tr>` : ''

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
        <tr><td style="padding:24px 32px 28px;font-size:12px;color:#8A8A8A;border-top:1px solid #E5E3DB;margin-top:20px;">
          You&rsquo;re receiving this email from Rocky's Retreat and Rambles. Questions? Just reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// ---- Template helpers ---------------------------------------------------

export async function sendAdminNewBookingAlert(opts: {
  to: string[]
  dogName: string
  clientName: string
  scheduledDate: string
  scheduledTime: string
  walkType: string
  notes?: string
}) {
  const body = `
    <p><strong>${opts.clientName}</strong> has requested a new walk for <strong>${opts.dogName}</strong>.</p>
    <table role="presentation" cellpadding="6" cellspacing="0" style="margin:16px 0;font-size:14px;">
      <tr><td style="color:#8A8A8A;">Date:</td><td>${opts.scheduledDate}</td></tr>
      <tr><td style="color:#8A8A8A;">Time:</td><td>${opts.scheduledTime}</td></tr>
      <tr><td style="color:#8A8A8A;">Type:</td><td style="text-transform:capitalize;">${opts.walkType}</td></tr>
      ${opts.notes ? `<tr><td style="color:#8A8A8A;vertical-align:top;">Notes:</td><td>${escapeHtml(opts.notes)}</td></tr>` : ''}
    </table>
    <p>Please review, assign a walker, and approve or decline the request.</p>`
  return send({
    to: opts.to,
    subject: `New walk request: ${opts.dogName} on ${opts.scheduledDate}`,
    html: wrap('New booking awaiting approval', body, {
      label: 'Review booking',
      url: `${appUrl}/admin/bookings`,
    }),
  })
}

export async function sendClientBookingApproved(opts: {
  to: string
  clientName: string
  dogName: string
  walkerName?: string
  scheduledDate: string
  scheduledTime: string
  note?: string
}) {
  const body = `
    <p>Hi ${opts.clientName || 'there'}, great news — your walk for <strong>${opts.dogName}</strong> on <strong>${opts.scheduledDate} at ${opts.scheduledTime}</strong> has been confirmed${opts.walkerName ? ` with <strong>${opts.walkerName}</strong>` : ''}.</p>
    ${opts.note ? `<p style="background:#FDF8EF;border-left:3px solid #DDA74F;padding:12px 14px;border-radius:4px;"><strong>Note from the team:</strong><br/>${escapeHtml(opts.note)}</p>` : ''}
    <p>We&rsquo;ll send you another email when your walker picks up ${opts.dogName}.</p>`
  return send({
    to: opts.to,
    subject: `Booking confirmed: ${opts.dogName} on ${opts.scheduledDate}`,
    html: wrap('Your walk is confirmed 🐾', body, {
      label: 'View booking',
      url: `${appUrl}/client/bookings`,
    }),
  })
}

export async function sendClientBookingRejected(opts: {
  to: string
  clientName: string
  dogName: string
  scheduledDate: string
  reason: string
}) {
  const body = `
    <p>Hi ${opts.clientName || 'there'}, unfortunately we&rsquo;re unable to accommodate your walk for <strong>${opts.dogName}</strong> on <strong>${opts.scheduledDate}</strong>.</p>
    <p style="background:#FDEDEA;border-left:3px solid #E06D53;padding:12px 14px;border-radius:4px;"><strong>Reason:</strong><br/>${escapeHtml(opts.reason)}</p>
    <p>Please head back to the app to book a different slot — we&rsquo;d love to walk ${opts.dogName} another time.</p>`
  return send({
    to: opts.to,
    subject: `Booking update: unable to confirm ${opts.dogName} on ${opts.scheduledDate}`,
    html: wrap('Booking couldn&rsquo;t be confirmed', body, {
      label: 'Book another slot',
      url: `${appUrl}/client/book`,
    }),
  })
}

export async function sendClientPickup(opts: {
  to: string
  clientName: string
  dogName: string
  walkerName?: string
}) {
  const body = `
    <p>Hi ${opts.clientName || 'there'} — quick update:</p>
    <p style="font-size:17px;"><strong>${opts.walkerName || 'Your walker'} has just picked up ${opts.dogName} 🐕</strong></p>
    <p>The walk has started. You&rsquo;ll get another email when ${opts.dogName} is safely back home. If anything comes up during the walk we&rsquo;ll reach out straight away.</p>`
  return send({
    to: opts.to,
    subject: `${opts.dogName} has been picked up 🐾`,
    html: wrap(`${opts.dogName} is off on their walk`, body, {
      label: 'View walk details',
      url: `${appUrl}/client/bookings`,
    }),
  })
}

export async function sendClientDropoff(opts: {
  to: string
  clientName: string
  dogName: string
  walkerName?: string
}) {
  const body = `
    <p>Hi ${opts.clientName || 'there'},</p>
    <p style="font-size:17px;"><strong>${opts.dogName} is safely home 🏠</strong></p>
    <p>${opts.walkerName || 'Your walker'} has just dropped ${opts.dogName} off. Check the photo gallery in the app to see how the walk went!</p>`
  return send({
    to: opts.to,
    subject: `${opts.dogName} is safely home 🏠`,
    html: wrap(`${opts.dogName} is back home`, body, {
      label: 'See walk photos',
      url: `${appUrl}/client/gallery`,
    }),
  })
}

export async function sendAdminWelcome(opts: {
  to: string
  fullName: string
  resetLink: string
}) {
  const body = `
    <p>Hi ${opts.fullName || 'there'},</p>
    <p>You&rsquo;ve been added as an administrator on <strong>Rocky's Retreat and Rambles</strong>. From the admin dashboard you can manage walkers, clients, dogs, and approve booking requests.</p>
    <p>To get started, set your password using the secure link below. The link is valid for 1 hour.</p>`
  return send({
    to: opts.to,
    subject: "Welcome to Rocky's Retreat and Rambles - set your password",
    html: wrap('Welcome to the team 👋', body, {
      label: 'Set my password',
      url: opts.resetLink,
    }),
  })
}

// ---- Weekly digests -----------------------------------------------------

export interface ClientWeeklyWalk {
  dogName: string
  date: string
  walkerName: string
  durationMinutes: number
  photoCount: number
}

export async function sendClientWeeklyDigest(opts: {
  to: string
  clientName: string
  weekLabel: string
  walks: ClientWeeklyWalk[]
  favouriteWalker?: string
  totalPhotos: number
}) {
  if (opts.walks.length === 0) return // skip clients with no activity
  const walksHtml = opts.walks.map(w => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:14px;"><strong>${escapeHtml(w.dogName)}</strong></td>
      <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;">${w.date}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;">${escapeHtml(w.walkerName)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.durationMinutes} min</td>
    </tr>`).join('')

  const totalMinutes = opts.walks.reduce((s, w) => s + w.durationMinutes, 0)
  const body = `
    <p>Hi ${escapeHtml(opts.clientName || 'there')}, here&rsquo;s how your pups got on this week.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border:1px solid #E5E3DB;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#F9F8F6;padding:14px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#1A4331;">${opts.walks.length}</div>
          <div style="font-size:12px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;">Walks</div>
        </td>
        <td style="background:#F9F8F6;padding:14px;text-align:center;width:33%;border-left:1px solid #E5E3DB;border-right:1px solid #E5E3DB;">
          <div style="font-size:24px;font-weight:700;color:#1A4331;">${totalMinutes}</div>
          <div style="font-size:12px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;">Minutes</div>
        </td>
        <td style="background:#F9F8F6;padding:14px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#DDA74F;">${opts.totalPhotos}</div>
          <div style="font-size:12px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;">Photos</div>
        </td>
      </tr>
    </table>
    ${opts.favouriteWalker ? `<p style="font-size:14px;color:#5C5C5C;">⭐ Favourite walker this week: <strong style="color:#1A4331;">${escapeHtml(opts.favouriteWalker)}</strong></p>` : ''}
    <h3 style="margin:24px 0 8px;font-size:15px;color:#1A1A1A;">This week&rsquo;s walks</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5E3DB;border-radius:8px;overflow:hidden;">
      ${walksHtml}
    </table>`

  return send({
    to: opts.to,
    subject: `Your Rocky's Retreat and Rambles week: ${opts.walks.length} walk${opts.walks.length !== 1 ? 's' : ''} with ${opts.totalPhotos} photo${opts.totalPhotos !== 1 ? 's' : ''} 🐾`,
    html: wrap(`Your week with Rocky's Retreat and Rambles (${opts.weekLabel})`, body, {
      label: 'View photo gallery',
      url: `${appUrl}/client/gallery`,
    }),
  })
}

export interface WalkerKpi {
  name: string
  walks: number
  minutes: number
  avgRating: number | null
  photos: number
  revenue: number
}

export async function sendAdminWeeklyDigest(opts: {
  to: string[]
  weekLabel: string
  totalWalks: number
  totalMinutes: number
  totalPhotos: number
  totalRevenue: number
  pendingBookings: number
  newClients: number
  newBookings: number
  cancelled: number
  walkerRows: WalkerKpi[]
  topClient?: { name: string; walks: number }
}) {
  const fmtMoney = (n: number) => `£${n.toFixed(2)}`

  const walkerHtml = opts.walkerRows.length === 0
    ? `<tr><td colspan="5" style="padding:14px;text-align:center;color:#8A8A8A;font-size:13px;">No walker activity this week.</td></tr>`
    : opts.walkerRows.map(w => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:14px;"><strong>${escapeHtml(w.name)}</strong></td>
          <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.walks}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.minutes}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#5C5C5C;text-align:right;">${w.avgRating !== null ? `⭐ ${w.avgRating.toFixed(1)}` : '—'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #F2F0EB;font-size:13px;color:#1A4331;font-weight:600;text-align:right;">${fmtMoney(w.revenue)}</td>
        </tr>`).join('')

  const kpi = (label: string, value: string | number, color = '#1A4331') => `
    <td style="background:#F9F8F6;padding:14px 10px;text-align:center;border:1px solid #E5E3DB;">
      <div style="font-size:22px;font-weight:700;color:${color};line-height:1.1;">${value}</div>
      <div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${label}</div>
    </td>`

  const body = `
    <p>Here&rsquo;s how Rocky's Retreat and Rambles performed this week (<strong>${opts.weekLabel}</strong>).</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border-collapse:separate;border-spacing:6px;">
      <tr>
        ${kpi('Revenue', fmtMoney(opts.totalRevenue), '#2D7A5D')}
        ${kpi('Completed walks', opts.totalWalks)}
        ${kpi('Total minutes', opts.totalMinutes)}
      </tr>
      <tr>
        ${kpi('Photos uploaded', opts.totalPhotos, '#DDA74F')}
        ${kpi('Pending approvals', opts.pendingBookings, opts.pendingBookings > 0 ? '#E06D53' : '#1A4331')}
        ${kpi('New bookings', opts.newBookings)}
      </tr>
      <tr>
        ${kpi('Cancelled', opts.cancelled, '#E06D53')}
        ${kpi('New clients', opts.newClients)}
        <td style="background:#F9F8F6;padding:14px 10px;border:1px solid #E5E3DB;">
          <div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:0.5px;">Top client</div>
          <div style="font-size:14px;font-weight:700;color:#1A4331;margin-top:4px;">${opts.topClient ? `${escapeHtml(opts.topClient.name)} · ${opts.topClient.walks}` : '—'}</div>
        </td>
      </tr>
    </table>

    <p style="font-size:12px;color:#8A8A8A;margin:-6px 0 16px;">Revenue = duration (hrs) × walker hourly rate, across completed walks.</p>

    <h3 style="margin:24px 0 8px;font-size:15px;color:#1A1A1A;">Walker performance</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5E3DB;border-radius:8px;overflow:hidden;">
      <tr style="background:#1A4331;color:#ffffff;">
        <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Walker</td>
        <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Walks</td>
        <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Minutes</td>
        <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Rating</td>
        <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Revenue</td>
      </tr>
      ${walkerHtml}
    </table>`

  return send({
    to: opts.to,
    subject: `Rocky's Retreat and Rambles weekly report — ${fmtMoney(opts.totalRevenue)} · ${opts.totalWalks} walks · ${opts.pendingBookings} pending`,
    html: wrap(`Weekly KPI report (${opts.weekLabel})`, body, {
      label: 'Open admin dashboard',
      url: `${appUrl}/admin`,
    }),
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br/>')
}
