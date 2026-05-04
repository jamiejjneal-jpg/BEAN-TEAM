// Walker payouts — monthly PDF generation & period calculations.
// Everything is client-side (jsPDF) so admins can download / email without a
// server round-trip. Payout rules live here so the admin page stays thin.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export type PayoutBooking = {
  id: string
  scheduled_date: string
  scheduled_time: string
  walk_type: string | null
  duration_minutes: number | null
  dog_name: string
  client_name: string
}

export type WalkerPayoutSummary = {
  walker_id: string
  walker_name: string
  walker_email: string
  hourly_rate: number
  period_start: string
  period_end: string
  bookings: PayoutBooking[]
  total_minutes: number
  total_hours: number
  gross_pay: number
}

export function firstOfMonthISO(d = new Date()): string {
  const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x.toISOString().slice(0, 10)
}
export function lastOfMonthISO(d = new Date()): string {
  const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); return x.toISOString().slice(0, 10)
}

export function fmtGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n || 0)
}
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Default walk durations by walk_type (minutes), used when a booking has
// no explicit duration_minutes.
const DEFAULT_DURATIONS: Record<string, number> = {
  walk_30: 30, walk_60: 60, walk_60_two: 60, one_to_one: 45, training: 60, puppy_visit: 30,
  key_dropoff: 15, key_handover: 30, daycare_4: 240, daycare_day: 420, daycare_ext: 600,
  overnight: 1440, house_sit: 1440, pop_in: 30, vet_visit: 120, groomer_run: 90,
  meet_greet: 45, admin_note: 0,
}

export function durationForBooking(b: { walk_type?: string | null; duration_minutes?: number | null }): number {
  if (b.duration_minutes && b.duration_minutes > 0) return b.duration_minutes
  if (b.walk_type && DEFAULT_DURATIONS[b.walk_type] !== undefined) return DEFAULT_DURATIONS[b.walk_type]
  return 60 // safe fallback — one hour
}

export function summarise(
  walker: { id: string; full_name: string; email: string; hourly_rate: number },
  periodStart: string,
  periodEnd: string,
  bookings: PayoutBooking[],
): WalkerPayoutSummary {
  const totalMinutes = bookings.reduce((s, b) => s + durationForBooking(b), 0)
  const totalHours = +(totalMinutes / 60).toFixed(2)
  const grossPay = +(totalHours * walker.hourly_rate).toFixed(2)
  return {
    walker_id: walker.id,
    walker_name: walker.full_name || walker.email,
    walker_email: walker.email,
    hourly_rate: walker.hourly_rate,
    period_start: periodStart,
    period_end: periodEnd,
    bookings: bookings.sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time)),
    total_minutes: totalMinutes,
    total_hours: totalHours,
    gross_pay: grossPay,
  }
}

// ---- PDF generation -----------------------------------------------------
export async function renderPayoutPdf(
  summary: WalkerPayoutSummary,
  brand: { name: string } = { name: "Rocky's Retreat and Rambles" },
): Promise<{ dataUrl: string; base64: string; blob: Blob }> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = margin

  // Header bar
  doc.setFillColor(26, 67, 49) // #1A4331
  doc.rect(0, 0, pageW, 80, 'F')
  doc.setTextColor(255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(brand.name, margin, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Walker payout statement', margin, 58)
  y = 110

  // Walker + period box
  doc.setTextColor(26, 26, 26)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(summary.walker_name, margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(92, 92, 92)
  doc.text(summary.walker_email, margin, y + 14)
  doc.text(
    `Period: ${fmtDate(summary.period_start)} — ${fmtDate(summary.period_end)}`,
    margin, y + 28,
  )
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, margin, y + 42)

  // Right-aligned totals panel
  const totalsX = pageW - margin - 170
  doc.setDrawColor(229, 227, 219)
  doc.setFillColor(248, 247, 243)
  doc.roundedRect(totalsX, y - 16, 170, 80, 6, 6, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(138, 138, 138)
  doc.setFontSize(9)
  doc.text('HOURS', totalsX + 10, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 26)
  doc.setFontSize(14)
  doc.text(`${summary.total_hours.toFixed(2)} h`, totalsX + 10, y + 16)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(138, 138, 138)
  doc.setFontSize(9)
  doc.text('GROSS PAY', totalsX + 10, y + 34)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 67, 49)
  doc.setFontSize(18)
  doc.text(fmtGBP(summary.gross_pay), totalsX + 10, y + 54)

  y += 80

  // Per-walk table
  const rows = summary.bookings.map(b => {
    const mins = durationForBooking(b)
    const hrs = +(mins / 60).toFixed(2)
    const pay = +(hrs * summary.hourly_rate).toFixed(2)
    return [
      fmtDate(b.scheduled_date),
      b.scheduled_time?.slice(0, 5) || '',
      b.dog_name,
      b.client_name,
      (b.walk_type || '').replace(/_/g, ' '),
      `${mins}m`,
      fmtGBP(pay),
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: [40, 40, 40] },
    headStyles: { fillColor: [26, 67, 49], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 247, 243] },
    head: [['Date', 'Time', 'Dog', 'Client', 'Service', 'Duration', 'Pay']],
    body: rows.length ? rows : [['', '', '', 'No completed walks in this period.', '', '', '']],
    columnStyles: {
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold', textColor: [26, 67, 49] },
    },
  })

  // Footer totals
  const finalY = (doc as any).lastAutoTable?.finalY || y + 20
  doc.setDrawColor(229, 227, 219)
  doc.line(margin, finalY + 10, pageW - margin, finalY + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(92, 92, 92)
  doc.text(`Rate: ${fmtGBP(summary.hourly_rate)}/hour · ${summary.bookings.length} completed walks`, margin, finalY + 28)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(26, 67, 49)
  doc.text(`TOTAL: ${fmtGBP(summary.gross_pay)}`, pageW - margin, finalY + 28, { align: 'right' })

  doc.setFont('helvetica', 'italic')
  doc.setTextColor(138, 138, 138)
  doc.setFontSize(8)
  doc.text(
    'This statement reflects completed walks only. Please check and reply to admin with any queries before payment is issued.',
    pageW / 2, doc.internal.pageSize.getHeight() - 30, { align: 'center', maxWidth: pageW - 2 * margin },
  )

  const dataUrl = doc.output('datauristring')
  const blob = doc.output('blob') as Blob
  const base64 = dataUrl.split(',')[1] || ''
  return { dataUrl, base64, blob }
}

export async function emailPayout(
  supabase: any,
  summary: WalkerPayoutSummary,
  brand: { name: string } = { name: "Rocky's Retreat and Rambles" },
): Promise<void> {
  const { base64 } = await renderPayoutPdf(summary, brand)
  const subject = `Your ${new Date(summary.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} payout — ${fmtGBP(summary.gross_pay)}`
  const html = `
    <p>Hi ${summary.walker_name.split(' ')[0]},</p>
    <p>Attached is your payout statement for <strong>${fmtDate(summary.period_start)} — ${fmtDate(summary.period_end)}</strong>.</p>
    <ul>
      <li>Completed walks: <strong>${summary.bookings.length}</strong></li>
      <li>Total hours: <strong>${summary.total_hours.toFixed(2)}</strong></li>
      <li>Gross pay: <strong>${fmtGBP(summary.gross_pay)}</strong></li>
    </ul>
    <p>Please reply if anything looks off. Payment will be issued shortly.</p>
    <p>— ${brand.name}</p>`

  const { error } = await supabase.functions.invoke('bulk-mail', {
    body: {
      subject,
      html,
      recipients: [{ email: summary.walker_email, full_name: summary.walker_name }],
      attachments: [{
        filename: `payout_${summary.period_start.slice(0, 7)}_${summary.walker_name.replace(/\s+/g, '_')}.pdf`,
        content: base64,
        contentType: 'application/pdf',
      }],
      audit_name: `[PAYOUT] ${summary.walker_name} ${summary.period_start.slice(0, 7)}`,
    },
  })
  if (error) throw new Error(error.message || 'Email failed')
}
