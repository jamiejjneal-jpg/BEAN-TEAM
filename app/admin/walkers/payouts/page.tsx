'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, CheckCircle2, Clock, PoundSterling, Loader2, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/audit'

type WeekRow = {
  week_start: string
  walks: number
  minutes: number
  amount: number
  paid: boolean
  paid_at: string | null
  notes: string
  payout_id: string | null
}

type Walker = { id: string; full_name: string; email: string; phone: string; avatar_url: string | null }

type ComputedData = {
  walker: Walker
  hourly_rate: number
  weeks: WeekRow[]
  summary: { total_unpaid: number; total_paid: number; unpaid_count: number }
}

function fmt(n: number) { return `£${n.toFixed(2)}` }
function fmtDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6)
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-GB', o)} – ${end.toLocaleDateString('en-GB', o)}`
}

// Monday-start ISO week (YYYY-MM-DD string).
function weekStartOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = d.getUTCDay()
  const diff = (dow + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

function WalkerPayoutsInner() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''
  const supabase = createClient()
  const [data, setData] = useState<ComputedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<WeekRow | null>(null)
  const [notes, setNotes] = useState('')

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [walkerRes, rateRes, bookingsRes, payoutsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, phone, avatar_url').eq('id', id).maybeSingle(),
        supabase.from('walker_profiles').select('hourly_rate').eq('id', id).maybeSingle(),
        supabase.from('bookings')
          .select('id, scheduled_date, duration_minutes, status')
          .eq('walker_id', id)
          .eq('status', 'completed')
          .order('scheduled_date', { ascending: false }),
        supabase.from('walker_payouts')
          .select('id, week_start, amount, walks_count, total_minutes, paid_at, paid_by, notes')
          .eq('walker_id', id),
      ])

      if (walkerRes.error || !walkerRes.data) {
        throw new Error(walkerRes.error?.message || 'Walker not found')
      }

      const hourlyRate = Number(rateRes.data?.hourly_rate) || 0
      const bookings = bookingsRes.data || []
      const payouts = payoutsRes.data || []

      const buckets = new Map<string, { week_start: string; walks: number; minutes: number; amount: number }>()
      for (const b of bookings as Array<{ scheduled_date: string | null; duration_minutes: number | null }>) {
        if (!b.scheduled_date) continue
        const ws = weekStartOf(b.scheduled_date)
        const cur = buckets.get(ws) || { week_start: ws, walks: 0, minutes: 0, amount: 0 }
        cur.walks += 1
        cur.minutes += b.duration_minutes || 0
        cur.amount += ((b.duration_minutes || 0) / 60) * hourlyRate
        buckets.set(ws, cur)
      }

      const paidMap = new Map<string, any>(payouts.map((p: any) => [p.week_start, p]))

      const weeks: WeekRow[] = Array.from(buckets.values())
        .sort((a, b) => b.week_start.localeCompare(a.week_start))
        .map(w => {
          const paid = paidMap.get(w.week_start)
          return {
            week_start: w.week_start,
            walks: w.walks,
            minutes: w.minutes,
            amount: Number(w.amount.toFixed(2)),
            paid: !!paid,
            paid_at: paid?.paid_at || null,
            notes: paid?.notes || '',
            payout_id: paid?.id || null,
          }
        })

      const totalUnpaid = weeks.filter(w => !w.paid).reduce((s, w) => s + w.amount, 0)
      const totalPaid = weeks.filter(w => w.paid).reduce((s, w) => s + w.amount, 0)

      setData({
        walker: walkerRes.data as Walker,
        hourly_rate: hourlyRate,
        weeks,
        summary: {
          total_unpaid: Number(totalUnpaid.toFixed(2)),
          total_paid: Number(totalPaid.toFixed(2)),
          unpaid_count: weeks.filter(w => !w.paid).length,
        },
      })
    } catch (e: any) {
      toast.error(`Failed to load payouts: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [id, supabase])

  useEffect(() => { fetchData() }, [fetchData])

  async function markPaid(week: WeekRow, notesValue: string) {
    setSaving(week.week_start)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('walker_payouts').upsert({
        walker_id: id,
        week_start: week.week_start,
        amount: week.amount,
        walks_count: week.walks,
        total_minutes: week.minutes,
        paid_at: new Date().toISOString(),
        paid_by: user.id,
        notes: notesValue || '',
      }, { onConflict: 'walker_id,week_start' })
      if (error) throw error
      toast.success(`Marked ${fmtDate(week.week_start)} as paid`)
      logAudit({ action: 'payout_marked_paid', target_type: 'payout', target_id: `${id}-${week.week_start}`, target_name: `${data.walker.full_name} · ${fmtDate(week.week_start)}`, details: { amount: week.amount, walks: week.walks, minutes: week.minutes, notes: notesValue } })
      setConfirm(null); setNotes('')
      fetchData()
    } catch (e: any) {
      toast.error(`Failed to save: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  async function markUnpaid(week: WeekRow) {
    setSaving(week.week_start)
    const { error } = await supabase
      .from('walker_payouts')
      .delete()
      .eq('walker_id', id)
      .eq('week_start', week.week_start)
    setSaving(null)
    if (error) {
      toast.error(`Failed to reverse: ${error.message}`)
      return
    }
    toast.success(`Marked ${fmtDate(week.week_start)} as unpaid`)
    logAudit({ action: 'payout_reversed', target_type: 'payout', target_id: `${id}-${week.week_start}`, target_name: `${data.walker.full_name} · ${fmtDate(week.week_start)}`, details: { amount: week.amount } })
    fetchData()
  }

  if (!id) return <div className="py-20 text-center text-[#8A8A8A]">Missing walker id</div>
  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>
  if (!data) return <div className="py-20 text-center text-[#8A8A8A]">Walker not found</div>

  const initials = data.walker.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'W'

  return (
    <div className="space-y-6" data-testid="walker-payouts-page">
      <Link href="/admin/walkers" className="inline-flex items-center gap-1.5 text-sm text-[#5C5C5C] hover:text-[#1A4331]" data-testid="payouts-back-link">
        <ArrowLeft className="h-4 w-4" /> Back to walkers
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {data.walker.avatar_url ? (
          <img src={data.walker.avatar_url} alt={data.walker.full_name} className="h-16 w-16 rounded-full object-cover border-2 border-[#E8F0EC]" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-[#E8F0EC] flex items-center justify-center text-[#1A4331] font-bold text-lg">{initials}</div>
        )}
        <div className="flex-1">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{data.walker.full_name} · Payouts</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-[#5C5C5C]">
            <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {data.walker.email}</span>
            {data.walker.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {data.walker.phone}</span>}
            <Badge variant="secondary">£{data.hourly_rate.toFixed(2)}/hr</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[#E06D53]/30 bg-[#FDEDEA]/40">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#FDEDEA] flex items-center justify-center"><Clock className="h-5 w-5 text-[#E06D53]" /></div>
            <div>
              <p className="text-xs text-[#8A8A8A] uppercase tracking-wide">Unpaid</p>
              <p className="text-2xl font-heading font-bold text-[#E06D53]">{fmt(data.summary.total_unpaid)}</p>
              <p className="text-xs text-[#8A8A8A]">{data.summary.unpaid_count} week{data.summary.unpaid_count !== 1 ? 's' : ''}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#2D7A5D]/30 bg-[#E8F0EC]/40">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-[#2D7A5D]" /></div>
            <div>
              <p className="text-xs text-[#8A8A8A] uppercase tracking-wide">Paid to date</p>
              <p className="text-2xl font-heading font-bold text-[#2D7A5D]">{fmt(data.summary.total_paid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#F2F0EB] flex items-center justify-center"><PoundSterling className="h-5 w-5 text-[#1A4331]" /></div>
            <div>
              <p className="text-xs text-[#8A8A8A] uppercase tracking-wide">Lifetime total</p>
              <p className="text-2xl font-heading font-bold">{fmt(data.summary.total_paid + data.summary.total_unpaid)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Weekly breakdown</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.weeks.length === 0 ? (
            <p className="text-center py-12 text-[#8A8A8A] text-sm">No completed walks yet for this walker.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E3DB] bg-[#F9F8F6]">
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Week</th>
                    <th className="text-right py-3 px-4 font-medium text-[#5C5C5C]">Walks</th>
                    <th className="text-right py-3 px-4 font-medium text-[#5C5C5C]">Minutes</th>
                    <th className="text-right py-3 px-4 font-medium text-[#5C5C5C]">Owed</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-[#5C5C5C]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map(w => (
                    <tr key={w.week_start} className="border-b border-[#F2F0EB] last:border-0 hover:bg-[#F9F8F6]">
                      <td className="py-3 px-4 font-mono text-xs">{fmtDate(w.week_start)}</td>
                      <td className="py-3 px-4 text-right">{w.walks}</td>
                      <td className="py-3 px-4 text-right">{w.minutes}</td>
                      <td className="py-3 px-4 text-right font-semibold text-[#1A4331]">{fmt(w.amount)}</td>
                      <td className="py-3 px-4">
                        {w.paid ? (
                          <Badge variant="success" data-testid={`payout-paid-${w.week_start}`}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Paid {w.paid_at ? new Date(w.paid_at).toLocaleDateString('en-GB') : ''}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" data-testid={`payout-unpaid-${w.week_start}`}>Unpaid</Badge>
                        )}
                        {w.paid && w.notes && <p className="text-xs text-[#8A8A8A] mt-1 italic">{w.notes}</p>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {w.paid ? (
                          <Button size="sm" variant="ghost" className="text-[#E06D53]" disabled={saving === w.week_start} onClick={() => markUnpaid(w)} data-testid={`mark-unpaid-${w.week_start}`}>
                            {saving === w.week_start ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mark unpaid'}
                          </Button>
                        ) : (
                          <Button size="sm" disabled={saving === w.week_start} onClick={() => { setConfirm(w); setNotes('') }} data-testid={`mark-paid-${w.week_start}`}>
                            Mark paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm payment</DialogTitle>
            <DialogDescription>
              Mark <strong>{confirm && fmtDate(confirm.week_start)}</strong> as paid · <strong className="text-[#1A4331]">{confirm && fmt(confirm.amount)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-[#F9F8F6] border border-[#E5E3DB] p-3 text-sm space-y-1">
              <p><span className="text-[#8A8A8A]">Walks:</span> {confirm?.walks}</p>
              <p><span className="text-[#8A8A8A]">Minutes:</span> {confirm?.minutes}</p>
              <p><span className="text-[#8A8A8A]">Rate:</span> £{data.hourly_rate.toFixed(2)}/hr</p>
            </div>
            <div className="space-y-2">
              <Label>Payment reference / note (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bank transfer ref #12345, paid via PayPal..." data-testid="payout-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => confirm && markPaid(confirm, notes)} disabled={!!saving} data-testid="confirm-mark-paid">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Confirm payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function WalkerPayoutsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>}>
      <WalkerPayoutsInner />
    </Suspense>
  )
}
