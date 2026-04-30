'use client'

// Walker self-service holiday / sick-day manager. Reads + writes
// public.walker_unavailability (RLS: walkers manage own, admins read all).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plane, Plus, Trash2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'

type Unavail = {
  id: string
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
}

function classify(row: Unavail): 'past' | 'active' | 'upcoming' {
  const today = new Date().toISOString().slice(0, 10)
  if (row.end_date < today) return 'past'
  if (row.start_date <= today && row.end_date >= today) return 'active'
  return 'upcoming'
}

export default function WalkerUnavailability() {
  const { user } = useAuth()
  const supabase = createClient()
  const [rows, setRows] = useState<Unavail[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) fetchRows() }, [user])

  async function fetchRows() {
    const { data } = await supabase
      .from('walker_unavailability')
      .select('*')
      .eq('walker_id', user!.id)
      .order('start_date', { ascending: false })
    setRows((data as Unavail[]) || [])
    setLoading(false)
  }

  async function add() {
    if (!form.start_date || !form.end_date) { toast.error('Pick both start and end dates'); return }
    if (form.end_date < form.start_date) { toast.error('End date must be after start date'); return }
    setSaving(true)
    const { error } = await supabase.from('walker_unavailability').insert({
      walker_id: user!.id,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error('Could not save: ' + error.message); return }
    toast.success('Time off saved — admin will see it on the schedule')
    setForm({ start_date: '', end_date: '', reason: '' })
    fetchRows()
  }

  async function remove(id: string) {
    if (!confirm('Remove this time-off block?')) return
    await supabase.from('walker_unavailability').delete().eq('id', id)
    toast.success('Removed')
    fetchRows()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const active = rows.filter(r => classify(r) === 'active')
  const upcoming = rows.filter(r => classify(r) === 'upcoming')
  const past = rows.filter(r => classify(r) === 'past').slice(0, 12)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6 max-w-3xl" data-testid="walker-unavailability-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Plane className="h-7 w-7 text-[#1A4331]" /> Time off
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">Block holidays or sick days so admin doesn’t assign you walks on those dates.</p>
      </div>

      {active.length > 0 && (
        <Card className="border-[#E06D53]/40 bg-[#FDEDEA]" data-testid="active-leave-banner">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#E06D53] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-[#1A1A1A]">You’re currently marked unavailable</p>
              <p className="text-[#5C5C5C] mt-0.5">Until <strong>{formatDate(active[0].end_date)}</strong>{active[0].reason ? ` · ${active[0].reason}` : ''}.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Add time off</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" min={today} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} data-testid="leave-start" />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" min={form.start_date || today} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} data-testid="leave-end" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason <span className="text-[#8A8A8A] font-normal">(optional — just for admin context)</span></Label>
            <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Holiday, feeling unwell, vet appointment…" data-testid="leave-reason" />
          </div>
          <div className="flex justify-end">
            <Button onClick={add} disabled={saving || !form.start_date || !form.end_date} data-testid="add-leave">
              {saving ? 'Saving…' : 'Save time off'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C]">Upcoming</p>
          <div className="space-y-2">
            {upcoming.map(r => <LeaveRow key={r.id} row={r} onRemove={remove} badgeLabel="Upcoming" badgeTone="default" />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C]">Past</p>
          <div className="space-y-2">
            {past.map(r => <LeaveRow key={r.id} row={r} onRemove={remove} badgeLabel="Past" badgeTone="secondary" />)}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">
          <Plane className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
          No time off booked yet. Admin will assume you’re available on every date in your weekly schedule.
        </CardContent></Card>
      )}
    </div>
  )
}

function LeaveRow({ row, onRemove, badgeLabel, badgeTone }: { row: Unavail; onRemove: (id: string) => void; badgeLabel: string; badgeTone: any }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#F9F8F6] border border-[#E5E3DB]" data-testid={`leave-row-${row.id}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {formatDate(row.start_date)}{row.start_date !== row.end_date ? ` → ${formatDate(row.end_date)}` : ''}
        </p>
        {row.reason && <p className="text-xs text-[#5C5C5C] mt-0.5 truncate">{row.reason}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={badgeTone} className="text-[10px]">{badgeLabel}</Badge>
        <button onClick={() => onRemove(row.id)} className="text-[#E06D53] hover:text-[#C95A41] p-1" aria-label="Remove" data-testid={`remove-leave-${row.id}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
