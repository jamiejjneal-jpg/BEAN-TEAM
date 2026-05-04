// Invoice helpers: build line-items from completed bookings for a period,
// render the canonical PDF, and email the PDF via Resend through the
// existing `bulk-mail` edge function.

'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createClient } from '@/lib/supabase/client'

export type Invoice = {
  id: string
  invoice_no: string
  client_id: string
  issue_date: string
  due_date: string
  period_start: string | null
  period_end: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
  notes: string | null
  sent_at: string | null
  paid_at: string | null
  paid_method: string | null
  created_at: string
  client?: { full_name: string | null; email: string | null; address?: string | null } | null
}

export type InvoiceItem = {
  id?: string
  invoice_id?: string
  booking_id?: string | null
  description: string
  qty: number
  unit_price: number
  line_total: number
  sort_order?: number
}

export function fmtGBP(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(n || 0))
}

export function fmtDate(d?: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

/**
 * Build line-items for a client from completed bookings in a given period.
 * Returns both the rows and a convenient subtotal.
 */
export async function buildItemsForPeriod(opts: {
  clientId: string
  periodStart: string   // ISO date
  periodEnd: string     // ISO date inclusive
}): Promise<{ items: InvoiceItem[]; subtotal: number }> {
  const supabase = createClient()
  const [{ data: bookings }, { data: services }] = await Promise.all([
    supabase.from('bookings')
      .select('id, scheduled_date, scheduled_time, walk_type, duration_minutes, dog:dogs(name)')
      .eq('client_id', opts.clientId)
      .eq('status', 'completed')
      .gte('scheduled_date', opts.periodStart)
      .lte('scheduled_date', opts.periodEnd)
      .order('scheduled_date', { ascending: true }),
    supabase.from('site_services').select('value, label, price'),
  ])
  const svcMap = new Map<string, { label: string; price: number }>()
  for (const s of (services as any[]) || []) svcMap.set(s.value, { label: s.label, price: Number(s.price) })

  const items: InvoiceItem[] = []
  let sort = 0
  for (const b of (bookings as any[]) || []) {
    const svc = svcMap.get(b.walk_type) || { label: b.walk_type, price: 0 }
    const desc = `${svc.label} · ${fmtDate(b.scheduled_date)} at ${String(b.scheduled_time).slice(0, 5)}${b.dog?.name ? ' · ' + b.dog.name : ''}`
    items.push({
      booking_id: b.id,
      description: desc,
      qty: 1,
      unit_price: svc.price,
      line_total: svc.price,
      sort_order: sort++,
    })
  }
  const subtotal = items.reduce((s, r) => s + Number(r.line_total), 0)
  return { items, subtotal }
}

/**
 * Generate the invoice PDF (jsPDF) and return it as a data URL.
 */
export async function renderInvoicePdf(invoice: Invoice, items: InvoiceItem[], brand: {
  name: string
  logoDataUrl?: string | null
  addressLines?: string[]
  email?: string
}): Promise<{ dataUrl: string; blob: Blob }> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() }
  const margin = 40

  // Header
  if (brand.logoDataUrl) {
    try { doc.addImage(brand.logoDataUrl, 'PNG', margin, margin, 50, 50) } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text(brand.name, brand.logoDataUrl ? margin + 62 : margin, margin + 22)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100)
  const headY = brand.logoDataUrl ? margin + 40 : margin + 38
  let y = headY
  for (const line of (brand.addressLines || [])) { doc.text(line, brand.logoDataUrl ? margin + 62 : margin, y); y += 11 }
  if (brand.email) { doc.text(brand.email, brand.logoDataUrl ? margin + 62 : margin, y) }

  // Invoice meta (top right)
  doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(26)
  doc.text('INVOICE', page.w - margin, margin + 22, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100)
  doc.text(`Invoice no:   ${invoice.invoice_no}`, page.w - margin, margin + 38, { align: 'right' })
  doc.text(`Issue date:   ${fmtDate(invoice.issue_date)}`, page.w - margin, margin + 50, { align: 'right' })
  doc.text(`Due date:     ${fmtDate(invoice.due_date)}`, page.w - margin, margin + 62, { align: 'right' })
  if (invoice.period_start && invoice.period_end) {
    doc.text(`Period:       ${fmtDate(invoice.period_start)} — ${fmtDate(invoice.period_end)}`, page.w - margin, margin + 74, { align: 'right' })
  }

  // Bill to
  const billTopY = 130
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30)
  doc.text('BILL TO', margin, billTopY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70)
  doc.text(invoice.client?.full_name || 'Client', margin, billTopY + 14)
  if (invoice.client?.email)   doc.text(invoice.client.email,   margin, billTopY + 28)
  if (invoice.client?.address) doc.text(invoice.client.address, margin, billTopY + 42)

  // Items table
  autoTable(doc, {
    startY: billTopY + 70,
    head: [['Description', 'Qty', 'Unit', 'Total']],
    body: items.map(i => [i.description, String(i.qty), fmtGBP(i.unit_price), fmtGBP(i.line_total)]),
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [26, 67, 49], textColor: 255, halign: 'left' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 40 },
      2: { halign: 'right',  cellWidth: 80 },
      3: { halign: 'right',  cellWidth: 90 },
    },
    margin: { left: margin, right: margin },
  })

  let finalY: number = (doc as any).lastAutoTable?.finalY || billTopY + 120
  const totalsX = page.w - margin - 170
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70)

  const writeTotal = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, totalsX, finalY + 20)
    doc.text(value, page.w - margin, finalY + 20, { align: 'right' })
    finalY += 15
  }
  writeTotal('Subtotal', fmtGBP(invoice.subtotal))
  if (Number(invoice.tax_rate) > 0) {
    writeTotal(`VAT (${Number(invoice.tax_rate).toFixed(2)}%)`, fmtGBP(invoice.tax_amount))
  }
  doc.setDrawColor(200); doc.line(totalsX, finalY + 10, page.w - margin, finalY + 10)
  doc.setTextColor(30); doc.setFontSize(12)
  writeTotal('TOTAL DUE', fmtGBP(invoice.total), true)

  // Notes
  if (invoice.notes) {
    finalY += 30
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30)
    doc.text('Notes', margin, finalY)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
    const lines = doc.splitTextToSize(invoice.notes, page.w - margin * 2)
    doc.text(lines, margin, finalY + 12)
  }

  // Footer
  doc.setFontSize(8); doc.setTextColor(140)
  doc.text(
    `Status: ${invoice.status.toUpperCase()}   ·   Generated ${new Date().toLocaleString('en-GB')}`,
    margin, page.h - 24,
  )

  const blob = doc.output('blob')
  const dataUrl = doc.output('dataurlstring')
  return { dataUrl, blob }
}

/**
 * Send the invoice to the client by email with the PDF attached.
 * Uses the existing `bulk-mail` edge function for delivery; we ship
 * the PDF as a base64 attachment — keep it small. :)
 */
export async function emailInvoice(invoice: Invoice, items: InvoiceItem[], brand: any): Promise<void> {
  const supabase = createClient()
  if (!invoice.client?.email) throw new Error('Client has no email on file')
  const { dataUrl, blob } = await renderInvoicePdf(invoice, items, brand)

  // data URL like: data:application/pdf;base64,<...>
  const base64 = dataUrl.split(',')[1]
  const subject = `Invoice ${invoice.invoice_no} — ${brand.name}`
  const html = `
    <p>Hi ${invoice.client.full_name || 'there'},</p>
    <p>Thanks for trusting us with your pet. Here's your invoice for the period
    <strong>${fmtDate(invoice.period_start)} — ${fmtDate(invoice.period_end)}</strong>.</p>
    <p><strong>Amount due:</strong> ${fmtGBP(invoice.total)}<br/>
       <strong>Due date:</strong> ${fmtDate(invoice.due_date)}</p>
    <p>The full breakdown is attached as a PDF.</p>
    <p>— ${brand.name}</p>
  `
  await supabase.functions.invoke('bulk-mail', {
    body: {
      subject, html,
      recipients: [{ email: invoice.client.email, full_name: invoice.client.full_name || '' }],
      attachments: [{ filename: `${invoice.invoice_no}.pdf`, content: base64, contentType: 'application/pdf' }],
      audit_name: `[INVOICE] ${invoice.invoice_no}`,
    },
  })
  // Blob not needed further here; consumer may still want dataUrl if they'd like to preview
  void blob
}
