'use client'

// Admin monthly walker payouts
// - Pick a month → shows each walker's hours, completed walks, gross pay
// - Download an individual payout PDF
// - Email an individual payout PDF
// - One-click: email ALL payouts for the month

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, Mail, Wallet, Loader2, Users, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  firstOfMonthISO, lastOfMonthISO, fmtGBP, fmtDate,
  summarise, renderPayoutPdf, emailPayout, durationForBooking,
  type PayoutBooking, type WalkerPayoutSummary,
} from '@/lib/payouts'

export default function AdminPayoutsPage() {
  const supabase = createClient()
  const [month, setMonth] = useState<string>(firstOfMonthISO().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [brandName, setBrandName] = useState("Rocky's Retreat and Rambles")
  const [summaries, setSummaries] = useState<WalkerPayoutSummary[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => { fetchAll() /* eslint-disable-next-line */ }, [month])

  async function fetchAll() {
    setLoading(true)
    const periodStart = firstOfMonthISO(new Date(`${month}-01T12:00:00`))
    const periodEnd   = lastOfMonthISO(new Date(`${month}-01T12:00:00`))

    const [walkersRes, bookingsRes, brandRes] = await Promise.all([
      supabase.from('profiles')
        .select('id, full_name, email, walker_profiles(hourly_rate)')
        .eq('role', 'walker')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('bookings')
        .select(`id, scheduled_date, scheduled_time, walk_type, duration_minutes,
                 walker_id,
                 dog:dogs(name),
                 client:profiles!bookings_client_id_fkey(full_name, email)`)
        .eq('status', 'completed')
        .gte('scheduled_date', periodStart)
        .lte('scheduled_date', periodEnd),
      supabase.from('site_texts').select('key, value').eq('key', 'brand_name').maybeSingle(),
    ])

    const walkers = (walkersRes.data || []) as any[]
    const bookings = (bookingsRes.data || []) as any[]

    if (brandRes.data) setBrandName((brandRes.data as any).value || "Rocky's Retreat and Rambles")

    const byWalker = new Map<string, PayoutBooking[]>()
    for (const b of bookings) {
      const wid = b.walker_id
      if (!wid) continue
      if (!byWalker.has(wid)) byWalker.set(wid, [])
      byWalker.get(wid)!.push({
        id: b.id,
        scheduled_date: b.scheduled_date,
        scheduled_time: b.scheduled_time || '',
        walk_type: b.walk_type,
        duration_minutes: b.duration_minutes,
        dog_name: b.dog?.name || '—',
        client_name: b.client?.full_name || b.client?.email || '—',
      })
    }

    const out: WalkerPayoutSummary[] = walkers
      .map(w => summarise(
        {
          id: w.id,
          full_name: w.full_name,
          email: w.email,
          hourly_rate: Number(w.walker_profiles?.hourly_rate || 15),
        },
        periodStart, periodEnd,
        byWalker.get(w.id) || [],
      ))
      .filter(s => s.bookings.length > 0)
      .sort((a, b) => b.gross_pay - a.gross_pay)

    setSummaries(out)
    setLoading(false)
  }

  const totals = useMemo(() => {
    const t = summaries.reduce((a, s) => ({
      pay: a.pay + s.gross_pay,
      hours: a.hours + s.total_hours,
      walks: a.walks + s.bookings.length,
    }), { pay: 0, hours: 0, walks: 0 })
    return { ...t, pay: +t.pay.toFixed(2), hours: +t.hours.toFixed(2) }
  }, [summaries])

  async function downloadPdf(s: WalkerPayoutSummary) {
    setBusy(s.walker_id)
    try {
      const { dataUrl } = await renderPayoutPdf(s, { name: brandName })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `payout_${s.period_start.slice(0, 7)}_${s.walker_name.replace(/\s+/g, '_')}.pdf`
      a.click()
    } finally { setBusy(null) }
  }

  async function emailOne(s: WalkerPayoutSummary) {
    if (!confirm(`Email ${s.walker_name} their payout for ${month}?`)) return
    setBusy(s.walker_id)
    try {
      await emailPayout(supabase, s, { name: brandName })
      toast.success(`Emailed to ${s.walker_email}`)
    } catch (e: any) {
      toast.error(e?.message || 'Email failed')
    } finally { setBusy(null) }
  }

  async function emailAll() {
    if (summaries.length === 0) return
    if (!confirm(`Email payouts to all ${summaries.length} walkers for ${month}?`)) return
    setBulkBusy(true)
    let ok = 0, fail = 0
    for (const s of summaries) {
      try { await emailPayout(supabase, s, { name: brandName }); ok++ } catch { fail++ }
    }
    setBulkBusy(false)
    if (fail === 0) toast.success(`Sent ${ok} payout${ok === 1 ? '' : 's'}`)
    else toast.warning(`Sent ${ok}/${summaries.length} · ${fail} failed`)
  }

  return (
    <div className="space-y-6" data-testid="admin-payouts-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-7 w-7 text-[#1A4331]" /> Walker payouts
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">
            Monthly statements auto-calculated from completed walks. Download or email PDFs in one click.
          </p>
        </div>
        <Button variant="outline" onClick={emailAll} disabled={bulkBusy || summaries.length === 0} data-testid="email-all">
          {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
          Email all
        </Button>
      </div>

      {/* Month + totals */}
      <Card>
        <CardContent className="p-4 grid sm:grid-cols-[220px_1fr] gap-4 items-center">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} data-testid="payout-month" />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Kpi label="Walkers" value={summaries.length} />
            <Kpi label="Total hours" value={totals.hours.toFixed(1)} />
            <Kpi label="Total pay" value={fmtGBP(totals.pay)} highlight />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
        </div>
      ) : summaries.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-[#8A8A8A] text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
            No completed walks in {month} — no payouts to issue.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {summaries.map(s => (
            <Card key={s.walker_id} data-testid={`payout-${s.walker_id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center shrink-0 font-heading font-bold">
                    {s.walker_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{s.walker_name}</p>
                    <p className="text-xs text-[#8A8A8A] truncate">{s.walker_email}</p>
                    <p className="text-xs text-[#5C5C5C] mt-0.5">
                      {s.bookings.length} walks · {s.total_hours.toFixed(2)} h · {fmtGBP(s.hourly_rate)}/hr
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-[#8A8A8A]">Gross</p>
                    <p className="font-heading font-bold text-lg text-[#1A4331]">{fmtGBP(s.gross_pay)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadPdf(s)} disabled={busy === s.walker_id} data-testid={`dl-${s.walker_id}`}>
                    <Download className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                  <Button size="sm" onClick={() => emailOne(s)} disabled={busy === s.walker_id} data-testid={`em-${s.walker_id}`}>
                    {busy === s.walker_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Mail className="h-3.5 w-3.5 mr-1" /> Email</>}
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

function Kpi({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[#8A8A8A]">{label}</p>
      <p className={`font-heading font-bold ${highlight ? 'text-xl text-[#1A4331]' : 'text-lg text-[#1A1A1A]'}`}>{value}</p>
    </div>
  )
}
