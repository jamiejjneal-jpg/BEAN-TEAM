'use client'

// Admin invoices dashboard
// - KPIs at the top (revenue this month, outstanding, overdue count)
// - Create new invoice: manual line-items OR auto-fill from completed walks
// - Auto-generate monthly: one click → one invoice per client with completed walks in the month
// - Per-invoice: download PDF, email to client, mark paid / sent / void

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  FileText, Plus, Send, CheckCircle2, XCircle, Download, Mail, Trash2, Wand2, TrendingUp,
  AlertCircle, CalendarClock, Receipt, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  type Invoice, type InvoiceItem,
  fmtGBP, fmtDate, buildItemsForPeriod, renderInvoicePdf, emailInvoice,
} from '@/lib/invoices'

function firstOfMonthISO(d = new Date()) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x.toISOString().slice(0, 10) }
function lastOfMonthISO(d = new Date()) { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); return x.toISOString().slice(0, 10) }

const STATUS_TONES: Record<Invoice['status'], string> = {
  draft:    'bg-[#F2F0EB] text-[#5C5C5C] border-[#E5E3DB]',
  sent:     'bg-[#FDF8EF] text-[#DDA74F] border-[#DDA74F]/30',
  paid:     'bg-[#E8F0EC] text-[#1A4331] border-[#1A4331]/30',
  overdue:  'bg-[#FDEDEA] text-[#E06D53] border-[#E06D53]/30',
  void:     'bg-[#F2F0EB] text-[#8A8A8A] border-[#E5E3DB] line-through',
}

export default function AdminInvoicesPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [items, setItems] = useState<Record<string, InvoiceItem[]>>({})
  const [brand, setBrand] = useState<{ name: string; email?: string; logoDataUrl?: string | null; addressLines?: string[] }>({
    name: "Rocky's Retreat and Rambles",
  })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<null | 'manual' | 'auto'>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | Invoice['status']>('all')

  // Auto-generate dialog
  const [autoMonth, setAutoMonth] = useState<string>(firstOfMonthISO()) // any date in target month
  const [autoSaving, setAutoSaving] = useState(false)

  // Manual-create dialog
  const [manualForm, setManualForm] = useState<{
    client_id: string; period_start: string; period_end: string; notes: string;
    due_in_days: number; tax_rate: number; items: InvoiceItem[];
  }>({ client_id: '', period_start: firstOfMonthISO(), period_end: lastOfMonthISO(), notes: '', due_in_days: 14, tax_rate: 0, items: [] })

  // Preview dialog
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [invRes, clientsRes, itemsRes, brandRes] = await Promise.all([
      supabase.from('invoices')
        .select(`*, client:profiles!invoices_client_id_fkey(full_name, email, address)`)
        .order('issue_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, address').eq('role', 'client').eq('is_active', true).order('full_name'),
      supabase.from('invoice_items').select('*').order('sort_order', { ascending: true }),
      supabase.from('site_texts').select('key, value').in('key', ['brand_name']),
    ])
    setInvoices((invRes.data as Invoice[]) || [])
    setClients(clientsRes.data || [])
    const grouped: Record<string, InvoiceItem[]> = {}
    for (const it of (itemsRes.data as InvoiceItem[]) || []) {
      (grouped[it.invoice_id!] ||= []).push(it)
    }
    setItems(grouped)
    // Brand
    const brandName = (brandRes.data as any[] || []).find(r => r.key === 'brand_name')?.value || "Rocky's Retreat and Rambles"
    setBrand(b => ({ ...b, name: brandName }))
    setLoading(false)
  }

  // ----- KPIs ------------------------------------------------------------
  const kpis = useMemo(() => {
    const thisMonthStart = firstOfMonthISO()
    const thisMonthEnd = lastOfMonthISO()
    const today = new Date().toISOString().slice(0, 10)

    const paidThisMonth = invoices
      .filter(i => i.status === 'paid' && i.paid_at && i.paid_at.slice(0, 10) >= thisMonthStart && i.paid_at.slice(0, 10) <= thisMonthEnd)
      .reduce((s, i) => s + Number(i.total), 0)

    const outstanding = invoices
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + Number(i.total), 0)

    const overdueCount = invoices.filter(i => (i.status === 'sent' || i.status === 'overdue') && i.due_date < today).length
    const draftCount   = invoices.filter(i => i.status === 'draft').length
    const totalThisMonth = invoices
      .filter(i => i.issue_date >= thisMonthStart && i.issue_date <= thisMonthEnd)
      .reduce((s, i) => s + Number(i.total), 0)

    return { paidThisMonth, outstanding, overdueCount, draftCount, totalThisMonth }
  }, [invoices])

  // ----- Actions ---------------------------------------------------------
  async function openManual() {
    setManualForm({
      client_id: '', period_start: firstOfMonthISO(), period_end: lastOfMonthISO(),
      notes: '', due_in_days: 14, tax_rate: 0, items: [],
    })
    setCreating('manual')
  }

  async function autofillFromPeriod() {
    if (!manualForm.client_id) { toast.error('Pick a client first'); return }
    const { items: its } = await buildItemsForPeriod({
      clientId: manualForm.client_id,
      periodStart: manualForm.period_start,
      periodEnd: manualForm.period_end,
    })
    setManualForm(f => ({ ...f, items: its }))
    toast.success(`${its.length} completed walk${its.length === 1 ? '' : 's'} added`)
  }

  async function saveManual() {
    if (!manualForm.client_id) { toast.error('Pick a client'); return }
    if (manualForm.items.length === 0) { toast.error('No line items yet'); return }
    const subtotal = manualForm.items.reduce((s, r) => s + Number(r.line_total || 0), 0)
    const tax = +(subtotal * (Number(manualForm.tax_rate) / 100)).toFixed(2)
    const total = +(subtotal + tax).toFixed(2)
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + (manualForm.due_in_days || 14))
    const { data: noData } = await supabase.rpc('next_invoice_no')
    const { data: { user } } = await supabase.auth.getUser()

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_no: noData as any,
      client_id: manualForm.client_id,
      status: 'draft',
      issue_date: new Date().toISOString().slice(0, 10),
      due_date:   dueDate.toISOString().slice(0, 10),
      period_start: manualForm.period_start, period_end: manualForm.period_end,
      subtotal, tax_rate: manualForm.tax_rate, tax_amount: tax, total,
      notes: manualForm.notes.trim() || null,
      created_by: user?.id || null,
    }).select('*').single()
    if (error) { toast.error('Save failed: ' + error.message); return }
    const rows = manualForm.items.map((i, idx) => ({
      invoice_id: (inv as any).id,
      booking_id: i.booking_id || null,
      description: i.description, qty: i.qty, unit_price: i.unit_price, line_total: i.line_total,
      sort_order: idx,
    }))
    await supabase.from('invoice_items').insert(rows)
    toast.success('Invoice created as draft')
    setCreating(null); fetchAll()
  }

  async function autoGenerateMonthly() {
    setAutoSaving(true)
    try {
      const monthStart = firstOfMonthISO(new Date(autoMonth))
      const monthEnd   = lastOfMonthISO(new Date(autoMonth))
      const { data: { user } } = await supabase.auth.getUser()

      // One invoice per client with ≥1 completed walk in the period.
      let count = 0
      let skipped = 0
      for (const c of clients) {
        const { items: its } = await buildItemsForPeriod({ clientId: c.id, periodStart: monthStart, periodEnd: monthEnd })
        if (its.length === 0) { skipped++; continue }
        const subtotal = its.reduce((s, r) => s + Number(r.line_total), 0)
        const total = subtotal // no tax by default
        const { data: noData } = await supabase.rpc('next_invoice_no')
        const issue = new Date().toISOString().slice(0, 10)
        const due = new Date(); due.setDate(due.getDate() + 14)
        const { data: inv, error } = await supabase.from('invoices').insert({
          invoice_no: noData as any,
          client_id: c.id,
          status: 'draft',
          issue_date: issue, due_date: due.toISOString().slice(0, 10),
          period_start: monthStart, period_end: monthEnd,
          subtotal, tax_rate: 0, tax_amount: 0, total,
          notes: `Auto-generated from ${its.length} completed walk${its.length === 1 ? '' : 's'} in ${monthStart.slice(0, 7)}.`,
          created_by: user?.id || null,
        }).select('id').single()
        if (error) { continue }
        await supabase.from('invoice_items').insert(its.map((i, idx) => ({
          invoice_id: (inv as any).id,
          booking_id: i.booking_id || null,
          description: i.description, qty: i.qty, unit_price: i.unit_price, line_total: i.line_total,
          sort_order: idx,
        })))
        count++
      }
      toast.success(`Generated ${count} invoice${count === 1 ? '' : 's'} (${skipped} clients had no walks)`)
    } catch (e: any) {
      toast.error('Generate failed: ' + (e?.message || 'unknown'))
    } finally {
      setAutoSaving(false); setCreating(null); fetchAll()
    }
  }

  async function markStatus(inv: Invoice, status: Invoice['status'], method?: string) {
    setBusyId(inv.id)
    const patch: any = { status, updated_at: new Date().toISOString() }
    if (status === 'paid')     { patch.paid_at = new Date().toISOString(); patch.paid_method = method || 'manual' }
    if (status === 'sent')     { patch.sent_at = patch.sent_at || new Date().toISOString() }
    const { data: upd, error } = await supabase.from('invoices').update(patch).eq('id', inv.id).select('id')
    setBusyId(null)
    if (error) { toast.error('Update failed: ' + error.message); return }
    if (!upd || upd.length === 0) { toast.error('Save blocked — run the admin-write-policies migration.'); return }
    toast.success(`Marked ${status}`)
    fetchAll()
  }

  async function download(inv: Invoice) {
    setBusyId(inv.id)
    const its = items[inv.id] || []
    const { dataUrl } = await renderInvoicePdf(inv, its, brand)
    const a = document.createElement('a'); a.href = dataUrl; a.download = `${inv.invoice_no}.pdf`; a.click()
    setBusyId(null)
  }

  async function sendEmail(inv: Invoice) {
    if (!inv.client?.email) { toast.error('Client has no email on file'); return }
    if (!confirm(`Email ${inv.invoice_no} to ${inv.client.email}?`)) return
    setBusyId(inv.id)
    try {
      await emailInvoice(inv, items[inv.id] || [], brand)
      // also mark as sent in DB
      await supabase.from('invoices').update({ status: inv.status === 'draft' ? 'sent' : inv.status, sent_at: new Date().toISOString() }).eq('id', inv.id)
      toast.success('Emailed to ' + inv.client.email)
      fetchAll()
    } catch (e: any) {
      toast.error(e?.message || 'Email failed — check bulk-mail Resend key in Supabase secrets')
    } finally {
      setBusyId(null)
    }
  }

  async function del(inv: Invoice) {
    if (!confirm(`Permanently delete ${inv.invoice_no}? This cannot be undone.`)) return
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Invoice deleted')
    fetchAll()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const filtered = filterStatus === 'all' ? invoices : invoices.filter(i => i.status === filterStatus)

  const preview = previewId ? invoices.find(i => i.id === previewId) : null
  const previewItems = preview ? (items[preview.id] || []) : []

  return (
    <div className="space-y-6" data-testid="admin-invoices-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-7 w-7 text-[#1A4331]" /> Invoices
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">Create, send, and track payments — monthly auto-billing is one click away.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreating('auto')} data-testid="generate-monthly"><Wand2 className="h-4 w-4 mr-1" /> Auto-generate monthly</Button>
          <Button onClick={openManual} data-testid="new-invoice"><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard title="Paid this month" value={fmtGBP(kpis.paidThisMonth)} tone="green" icon={TrendingUp} />
        <KpiCard title="Issued this month" value={fmtGBP(kpis.totalThisMonth)} tone="neutral" icon={Receipt} />
        <KpiCard title="Outstanding" value={fmtGBP(kpis.outstanding)} tone="amber" icon={Send} />
        <KpiCard title="Overdue" value={String(kpis.overdueCount)} tone="red" icon={AlertCircle} />
        <KpiCard title="Drafts" value={String(kpis.draftCount)} tone="neutral" icon={FileText} />
      </div>

      {/* Filter tabs */}
      <Tabs value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All ({invoices.length})</TabsTrigger>
          <TabsTrigger value="draft" data-testid="tab-draft">Draft</TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-sent">Sent</TabsTrigger>
          <TabsTrigger value="paid" data-testid="tab-paid">Paid</TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tab-overdue">Overdue</TabsTrigger>
          <TabsTrigger value="void" data-testid="tab-void">Void</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">
          <Receipt className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
          No invoices {filterStatus !== 'all' ? `in ${filterStatus}` : 'yet'}.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const today = new Date().toISOString().slice(0, 10)
            const isOverdue = (inv.status === 'sent' || inv.status === 'overdue') && inv.due_date < today
            return (
              <Card key={inv.id} data-testid={`inv-${inv.invoice_no}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] flex items-center justify-center shrink-0">
                      <Receipt className="h-5 w-5 text-[#1A4331]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-semibold">{inv.invoice_no}</p>
                        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_TONES[isOverdue && inv.status !== 'paid' ? 'overdue' : inv.status]}`}>
                          {isOverdue && inv.status !== 'paid' ? 'OVERDUE' : inv.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-[#5C5C5C] mt-0.5">
                        {inv.client?.full_name || inv.client?.email || 'Client'} · {(items[inv.id] || []).length} item{(items[inv.id] || []).length === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-[#9C8E7A] mt-0.5">
                        Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}{inv.paid_at ? ` · Paid ${fmtDate(inv.paid_at)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right mr-2">
                      <p className="font-heading font-bold text-lg text-[#1A4331]">{fmtGBP(Number(inv.total))}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setPreviewId(inv.id)} data-testid={`view-${inv.invoice_no}`}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => download(inv)} disabled={busyId === inv.id} data-testid={`download-${inv.invoice_no}`}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => sendEmail(inv)} disabled={busyId === inv.id} data-testid={`email-${inv.invoice_no}`}>
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                    {inv.status !== 'paid' && inv.status !== 'void' && (
                      <Button size="sm" className="bg-[#2D7A5D] hover:bg-[#1A4331]" onClick={() => markStatus(inv, 'paid')} disabled={busyId === inv.id} data-testid={`paid-${inv.invoice_no}`}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark paid
                      </Button>
                    )}
                    <button onClick={() => del(inv)} className="text-[#E06D53] hover:text-[#C95A41] p-1.5 rounded-md hover:bg-red-50" aria-label="Delete" data-testid={`del-${inv.invoice_no}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Auto-generate dialog */}
      <Dialog open={creating === 'auto'} onOpenChange={(o) => !autoSaving && setCreating(o ? 'auto' : null)}>
        <DialogContent data-testid="auto-dialog">
          <DialogHeader>
            <DialogTitle>Auto-generate monthly invoices</DialogTitle>
            <DialogDescription>For every client who had completed walks in the chosen month, we'll create one draft invoice pre-filled from their walks. You can review and send after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Month</Label>
            <Input type="month" value={autoMonth.slice(0, 7)} onChange={e => setAutoMonth(`${e.target.value}-01`)} data-testid="auto-month" />
            <p className="text-xs text-[#8A8A8A]">Only <strong>completed</strong> walks are billed. Services without a price are skipped. Invoices are created as <strong>draft</strong> — nothing is emailed automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)} disabled={autoSaving}>Cancel</Button>
            <Button onClick={autoGenerateMonthly} disabled={autoSaving} data-testid="auto-generate-confirm">
              {autoSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4 mr-1" /> Generate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual create dialog */}
      <Dialog open={creating === 'manual'} onOpenChange={(o) => setCreating(o ? 'manual' : null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="manual-dialog">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>Build a line-item invoice. You can auto-fill from the client's completed walks in the period and then tweak.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={manualForm.client_id} onValueChange={v => setManualForm({ ...manualForm, client_id: v })}>
                  <SelectTrigger data-testid="m-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due in (days)</Label>
                <Input type="number" min={0} value={manualForm.due_in_days} onChange={e => setManualForm({ ...manualForm, due_in_days: parseInt(e.target.value) || 0 })} data-testid="m-due" />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Period start</Label>
                <Input type="date" value={manualForm.period_start} onChange={e => setManualForm({ ...manualForm, period_start: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input type="date" value={manualForm.period_end} onChange={e => setManualForm({ ...manualForm, period_end: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>VAT %</Label>
                <Input type="number" step="0.01" min={0} value={manualForm.tax_rate} onChange={e => setManualForm({ ...manualForm, tax_rate: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C]">Line items ({manualForm.items.length})</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={autofillFromPeriod} disabled={!manualForm.client_id} data-testid="m-autofill">
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-fill from walks
                </Button>
                <Button size="sm" variant="outline" onClick={() => setManualForm(f => ({ ...f, items: [...f.items, { description: '', qty: 1, unit_price: 0, line_total: 0 }] }))} data-testid="m-add-row">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              {manualForm.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_60px_90px_90px_30px] gap-2 items-center">
                  <Input value={it.description} onChange={e => {
                    const items = [...manualForm.items]; items[idx] = { ...it, description: e.target.value }
                    setManualForm({ ...manualForm, items })
                  }} placeholder="Description" data-testid={`m-desc-${idx}`} />
                  <Input type="number" min={1} value={it.qty} onChange={e => {
                    const qty = parseInt(e.target.value) || 1
                    const items = [...manualForm.items]; items[idx] = { ...it, qty, line_total: +(qty * it.unit_price).toFixed(2) }
                    setManualForm({ ...manualForm, items })
                  }} data-testid={`m-qty-${idx}`} />
                  <Input type="number" step="0.01" min={0} value={it.unit_price} onChange={e => {
                    const unit = parseFloat(e.target.value) || 0
                    const items = [...manualForm.items]; items[idx] = { ...it, unit_price: unit, line_total: +(it.qty * unit).toFixed(2) }
                    setManualForm({ ...manualForm, items })
                  }} data-testid={`m-unit-${idx}`} />
                  <div className="text-right font-mono text-sm text-[#1A4331]">{fmtGBP(it.line_total)}</div>
                  <button onClick={() => setManualForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-[#E06D53] hover:text-[#C95A41]" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {manualForm.items.length === 0 && <p className="text-xs text-[#8A8A8A] py-4 text-center">No items yet — add manually or auto-fill.</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Notes (shown on invoice)</Label>
              <Textarea value={manualForm.notes} onChange={e => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Payment instructions, thank-you, etc." />
            </div>

            <div className="pt-2 border-t flex items-center justify-end gap-6 text-sm">
              <div className="text-right">
                <p className="text-[#8A8A8A]">Subtotal: <span className="font-mono">{fmtGBP(manualForm.items.reduce((s, r) => s + Number(r.line_total), 0))}</span></p>
                {manualForm.tax_rate > 0 && (
                  <p className="text-[#8A8A8A]">VAT ({manualForm.tax_rate}%): <span className="font-mono">{fmtGBP(manualForm.items.reduce((s, r) => s + Number(r.line_total), 0) * manualForm.tax_rate / 100)}</span></p>
                )}
                <p className="font-heading font-bold text-lg text-[#1A4331]">Total: {fmtGBP(
                  manualForm.items.reduce((s, r) => s + Number(r.line_total), 0) *
                  (1 + manualForm.tax_rate / 100)
                )}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)}>Cancel</Button>
            <Button onClick={saveManual} disabled={!manualForm.client_id || manualForm.items.length === 0} data-testid="m-save">
              Save as draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewId} onOpenChange={() => setPreviewId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="preview-dialog">
          <DialogHeader>
            <DialogTitle>{preview?.invoice_no}</DialogTitle>
            <DialogDescription>
              {preview?.client?.full_name || preview?.client?.email} · {fmtDate(preview?.period_start)} — {fmtDate(preview?.period_end)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {previewItems.map(it => (
              <div key={it.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#F2F0EB] last:border-0">
                <span className="truncate">{it.description}</span>
                <span className="font-mono shrink-0 text-right">
                  {it.qty} × {fmtGBP(it.unit_price)} = <strong>{fmtGBP(it.line_total)}</strong>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 text-base">
              <span>Total</span>
              <span className="font-heading font-bold text-[#1A4331]">{fmtGBP(Number(preview?.total || 0))}</span>
            </div>
            {preview?.notes && <p className="text-xs italic text-[#5C5C5C] pt-2">{preview.notes}</p>}
          </div>
          <DialogFooter className="flex-row gap-2">
            {preview && (
              <>
                <Button variant="outline" onClick={() => download(preview)}><Download className="h-4 w-4 mr-1" /> PDF</Button>
                <Button variant="outline" onClick={() => sendEmail(preview)}><Mail className="h-4 w-4 mr-1" /> Email</Button>
                {preview.status !== 'paid' && <Button className="bg-[#2D7A5D] hover:bg-[#1A4331]" onClick={() => markStatus(preview, 'paid')}><CheckCircle2 className="h-4 w-4 mr-1" /> Paid</Button>}
                {preview.status !== 'void' && <Button variant="outline" onClick={() => markStatus(preview, 'void')}><XCircle className="h-4 w-4 mr-1" /> Void</Button>}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({ title, value, tone, icon: Icon }: { title: string; value: string; tone: 'green'|'amber'|'red'|'neutral'; icon: any }) {
  const tones: Record<string, string> = {
    green:   'bg-[#E8F0EC] text-[#1A4331]',
    amber:   'bg-[#FDF8EF] text-[#DDA74F]',
    red:     'bg-[#FDEDEA] text-[#E06D53]',
    neutral: 'bg-[#F2F0EB] text-[#5C5C5C]',
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`h-8 w-8 rounded-lg ${tones[tone]} flex items-center justify-center mb-2`}><Icon className="h-4 w-4" /></div>
        <p className="text-xs text-[#8A8A8A]">{title}</p>
        <p className="text-lg font-heading font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
