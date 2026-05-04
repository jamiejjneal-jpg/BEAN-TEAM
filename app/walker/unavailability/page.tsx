'use client'

// Walker self-service holiday / sick-day manager.
// Writes to public.walker_unavailability with status='pending' — awaits admin approval.
// Supports one-off, weekly recurring, and block-recurring patterns.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plane, Plus, Trash2, AlertCircle, Check, X as XIcon, Hourglass, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import { notifyAdminsTimeOffRequested } from '@/lib/notifyTimeOff'

type Row = {
  id: string
  walker_id: string
  start_date: string
  end_date: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  recurrence_type: 'weekly' | 'block' | null
  recurrence_weekday: number | null
  recurrence_block_weeks: number | null
  admin_note: string | null
  approved_at: string | null
  created_at: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function classify(row: Row): 'past' | 'active' | 'upcoming' | 'recurring' {
  if (row.recurrence_type) return 'recurring'
  const today = new Date().toISOString().slice(0, 10)
  const end = row.end_date ?? row.start_date
  if (end < today) return 'past'
  if (row.start_date <= today && end >= today) return 'active'
  return 'upcoming'
}

function statusBadge(s: Row['status']) {
  if (s === 'approved') return { cls: 'bg-[#E8F0EC] text-[#1A4331] border-[#1A4331]/30', icon: <Check className="h-3 w-3 mr-1" />, label: 'Approved' }
  if (s === 'rejected') return { cls: 'bg-[#FDEDEA] text-[#E06D53] border-[#E06D53]/30', icon: <XIcon className="h-3 w-3 mr-1" />, label: 'Rejected' }
  return { cls: 'bg-[#FDF8EF] text-[#DDA74F] border-[#DDA74F]/30', icon: <Hourglass className="h-3 w-3 mr-1" />, label: 'Pending' }
}

function describe(row: Row): string {
  const start = formatDate(row.start_date)
  const end = row.end_date ? formatDate(row.end_date) : 'ongoing'
  const base = row.start_date === row.end_date ? start : `${start} → ${end}`
  if (row.recurrence_type === 'weekly') {
    const dow = row.recurrence_weekday ?? new Date(row.start_date).getDay()
    return `${base} · weekly on ${WEEKDAYS[dow]}s`
  }
  if (row.recurrence_type === 'block' && row.recurrence_block_weeks) {
    return `${base} · repeats every ${row.recurrence_block_weeks} week${row.recurrence_block_weeks === 1 ? '' : 's'}`
  }
  return base
}

export default function WalkerUnavailability() {
  const { user, profile } = useAuth()
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // form state
  const [form, setForm] = useState<{
    start_date: string; end_date: string; reason: string;
    recurrence: 'none' | 'weekly' | 'block';
    block_weeks: number;
    ongoing: boolean;
  }>({ start_date: '', end_date: '', reason: '', recurrence: 'none', block_weeks: 2, ongoing: false })

  useEffect(() => { if (user) fetchRows() }, [user])

  async function fetchRows() {
    const { data } = await supabase
      .from('walker_unavailability')
      .select('*')
      .eq('walker_id', user!.id)
      .order('created_at', { ascending: false })
    setRows((data as Row[]) || [])
    setLoading(false)
  }

  async function add() {
    if (!form.start_date) { toast.error('Pick a start date'); return }
    if (!form.ongoing && !form.end_date) { toast.error('Pick an end date (or tick "ongoing")'); return }
    if (!form.ongoing && form.end_date && form.end_date < form.start_date) { toast.error('End date must be after start'); return }
    setSaving(true)
    const payload: any = {
      walker_id: user!.id,
      start_date: form.start_date,
      end_date: form.ongoing ? null : form.end_date,
      reason: form.reason.trim() || null,
      status: 'pending',
      requested_by: user!.id,
    }
    if (form.recurrence === 'weekly') {
      payload.recurrence_type = 'weekly'
      payload.recurrence_weekday = new Date(form.start_date).getDay()
    } else if (form.recurrence === 'block') {
      payload.recurrence_type = 'block'
      payload.recurrence_block_weeks = Math.max(1, Math.min(26, Math.floor(form.block_weeks || 2)))
    }
    const { data: inserted, error } = await supabase
      .from('walker_unavailability').insert(payload).select('*').single()
    if (error) {
      setSaving(false); toast.error('Could not submit: ' + error.message); return
    }
    await notifyAdminsTimeOffRequested(inserted, profile?.full_name || user?.email || null)
    setSaving(false)
    toast.success('Submitted — awaiting admin approval')
    setForm({ start_date: '', end_date: '', reason: '', recurrence: 'none', block_weeks: 2, ongoing: false })
    fetchRows()
  }

  async function withdraw(id: string) {
    if (!confirm('Withdraw this request?')) return
    const { error } = await supabase.from('walker_unavailability').delete().eq('id', id)
    if (error) { toast.error('Could not withdraw — only pending requests can be removed'); return }
    toast.success('Request withdrawn')
    fetchRows()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const pending = rows.filter(r => r.status === 'pending')
  const active = rows.filter(r => r.status === 'approved' && classify(r) === 'active')
  const recurring = rows.filter(r => r.status === 'approved' && r.recurrence_type)
  const upcomingApproved = rows.filter(r => r.status === 'approved' && !r.recurrence_type && classify(r) === 'upcoming')
  const past = rows.filter(r => classify(r) === 'past' || r.status === 'rejected').slice(0, 20)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6 max-w-3xl" data-testid="walker-unavailability-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Plane className="h-7 w-7 text-[#1A4331]" /> Time off
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">Request holidays, sick days, or recurring days off. Admin reviews each request before it’s honoured.</p>
      </div>

      {active.length > 0 && (
        <Card className="border-[#E06D53]/40 bg-[#FDEDEA]" data-testid="active-leave-banner">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#E06D53] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-[#1A1A1A]">You’re currently marked unavailable</p>
              <p className="text-[#5C5C5C] mt-0.5">Until <strong>{active[0].end_date ? formatDate(active[0].end_date) : 'further notice'}</strong>{active[0].reason ? ` · ${active[0].reason}` : ''}.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Request time off</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" min={today} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} data-testid="leave-start" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between gap-2">
                <span>To</span>
                <label className="flex items-center gap-1 text-[11px] font-normal cursor-pointer">
                  <input type="checkbox" checked={form.ongoing} onChange={e => setForm({ ...form, ongoing: e.target.checked, end_date: e.target.checked ? '' : form.end_date })} className="rounded border-[#E5E3DB]" data-testid="leave-ongoing" />
                  ongoing
                </label>
              </Label>
              <Input type="date" min={form.start_date || today} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} disabled={form.ongoing} data-testid="leave-end" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Repeat pattern</Label>
            <div className="grid sm:grid-cols-3 gap-2">
              {([
                { v: 'none',   label: 'One-off',            help: 'A single stretch of dates.' },
                { v: 'weekly', label: 'Every week',         help: 'Repeats on the same weekday.' },
                { v: 'block',  label: 'Every N weeks',      help: 'Auto-renews in a block pattern.' },
              ] as const).map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setForm({ ...form, recurrence: o.v as any })}
                  className={`text-left rounded-lg border p-3 transition-colors ${form.recurrence === o.v ? 'border-[#1A4331] bg-[#E8F0EC] ring-1 ring-[#1A4331]' : 'border-[#E5E3DB] hover:border-[#1A4331]'}`}
                  data-testid={`recurrence-${o.v}`}
                >
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="text-[11px] text-[#5C5C5C] mt-0.5">{o.help}</p>
                </button>
              ))}
            </div>
            {form.recurrence === 'weekly' && form.start_date && (
              <p className="text-xs text-[#5C5C5C] mt-1">Will repeat every <strong>{WEEKDAYS[new Date(form.start_date).getDay()]}</strong>.</p>
            )}
            {form.recurrence === 'block' && (
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs">Repeat every</Label>
                <Input type="number" min={1} max={26} value={form.block_weeks} onChange={e => setForm({ ...form, block_weeks: parseInt(e.target.value) || 2 })} className="w-20" data-testid="block-weeks" />
                <span className="text-xs text-[#5C5C5C]">weeks</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reason <span className="text-[#8A8A8A] font-normal">(optional — just for admin context)</span></Label>
            <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Holiday, feeling unwell, vet appointment…" data-testid="leave-reason" />
          </div>

          <div className="flex justify-end">
            <Button onClick={add} disabled={saving || !form.start_date} data-testid="add-leave">
              {saving ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
          <p className="text-xs text-[#8A8A8A]">You’ll be notified (in-app + email) when admin approves or rejects your request.</p>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Section title="Awaiting approval" testId="section-pending">
          {pending.map(r => <RowCard key={r.id} row={r} onWithdraw={withdraw} canWithdraw />)}
        </Section>
      )}

      {recurring.length > 0 && (
        <Section title="Recurring patterns" testId="section-recurring">
          {recurring.map(r => <RowCard key={r.id} row={r} />)}
        </Section>
      )}

      {upcomingApproved.length > 0 && (
        <Section title="Upcoming approved" testId="section-upcoming">
          {upcomingApproved.map(r => <RowCard key={r.id} row={r} />)}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past / rejected" testId="section-past">
          {past.map(r => <RowCard key={r.id} row={r} />)}
        </Section>
      )}

      {rows.length === 0 && (
        <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">
          <Plane className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
          No time off requested yet.
        </CardContent></Card>
      )}
    </div>
  )
}

function Section({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C]">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function RowCard({ row, onWithdraw, canWithdraw = false }: { row: Row; onWithdraw?: (id: string) => void; canWithdraw?: boolean }) {
  const badge = statusBadge(row.status)
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[#F9F8F6] border border-[#E5E3DB]" data-testid={`leave-row-${row.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{describe(row)}</p>
          <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}>
            {badge.icon}{badge.label}
          </span>
        </div>
        {row.reason && <p className="text-xs text-[#5C5C5C] mt-1">Reason: {row.reason}</p>}
        {row.status === 'rejected' && row.admin_note && (
          <p className="text-xs text-[#E06D53] mt-1">Admin note: {row.admin_note}</p>
        )}
        {row.status === 'approved' && row.admin_note && (
          <p className="text-xs text-[#1A4331]/80 mt-1">Admin note: {row.admin_note}</p>
        )}
      </div>
      {canWithdraw && onWithdraw && (
        <button onClick={() => onWithdraw(row.id)} className="text-[#E06D53] hover:text-[#C95A41] p-1 shrink-0" aria-label="Withdraw" data-testid={`withdraw-leave-${row.id}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
