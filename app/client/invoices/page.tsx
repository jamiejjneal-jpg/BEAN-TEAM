'use client'

// Client-facing invoice list — read their own invoices via RLS, download PDF.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Receipt, Download, CheckCircle2 } from 'lucide-react'
import { type Invoice, type InvoiceItem, fmtGBP, fmtDate, renderInvoicePdf } from '@/lib/invoices'

export default function ClientInvoicesPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [items, setItems] = useState<Record<string, InvoiceItem[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    const [invRes, itemsRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('client_id', user!.id).order('issue_date', { ascending: false }),
      supabase.from('invoice_items').select('*'),
    ])
    setInvoices((invRes.data as Invoice[]) || [])
    const grouped: Record<string, InvoiceItem[]> = {}
    for (const i of (itemsRes.data as InvoiceItem[]) || []) (grouped[i.invoice_id!] ||= []).push(i)
    setItems(grouped)
    setLoading(false)
  }

  async function download(inv: Invoice) {
    const { data: p } = await supabase.from('profiles').select('full_name, email, address').eq('id', inv.client_id).maybeSingle()
    const withClient = { ...inv, client: p as any } as Invoice
    const { dataUrl } = await renderInvoicePdf(withClient, items[inv.id] || [], { name: "Rocky's Retreat and Rambles" })
    const a = document.createElement('a'); a.href = dataUrl; a.download = `${inv.invoice_no}.pdf`; a.click()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="client-invoices-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-7 w-7 text-[#1A4331]" /> My invoices
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">Download PDF copies of every bill.</p>
      </div>

      {invoices.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">
          <Receipt className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
          No invoices yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <Card key={inv.id} data-testid={`inv-${inv.invoice_no}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] flex items-center justify-center shrink-0">
                    <Receipt className="h-5 w-5 text-[#1A4331]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-semibold">{inv.invoice_no}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F2F0EB] text-[#5C5C5C]">{inv.status.toUpperCase()}</span>
                      {inv.status === 'paid' && <span className="inline-flex items-center text-[10px] text-[#1A4331]"><CheckCircle2 className="h-3 w-3 mr-0.5" /> Paid {fmtDate(inv.paid_at)}</span>}
                    </div>
                    <p className="text-sm text-[#5C5C5C] mt-0.5">Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-heading font-bold text-lg text-[#1A4331]">{fmtGBP(Number(inv.total))}</p>
                  <Button size="sm" variant="outline" onClick={() => download(inv)} data-testid={`download-${inv.invoice_no}`}>
                    <Download className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
