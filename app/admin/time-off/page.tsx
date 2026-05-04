'use client'

// Admin time-off manager
// • Pending approval queue at top — approve/reject with optional note
// • Admin-create path — auto-approved, walker notified (in-app + email)
// • Full history with walker/status filter
// Writes to public.walker_unavailability with RLS scope 'admins manage all'.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plane, Plus, Check, X as XIcon, Hourglass, Repeat, Trash2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import { notifyWalkerTimeOff } from '@/lib/notifyTimeOff'

type Row = {
  id: string
  walker_id: string
  walker?: { full_name: string | null; email: string | null }
  start_date: string
  end_date: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  recurrence_type: 'weekly' | 'block' | null
  recurrence_weekday: number | null
  recurrence_block_weeks: number | null
  admin_note: string | null
  approved_at: string | null
  approved_by: string | null
  requested_by: string | null
  created_at: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function describe(row: Row): string {
  const start = formatDate(row.start_date)
  const end = row.end_date ? formatDate(row.end_date) : 'ongoing'
  const base = row.start_date === row.end_date ? start : `${start} → ${end}`
  if (row.recurrence_type === 'weekly') {
    const dow = row.recurrence_weekday ?? new Date(row.start_date).getDay()
    return `${base} · weekly on ${WEEKDAYS[dow]}s`
  }
  if (row.recurrence_type === 'block' && row.recurrence_block_weeks) {
    return `${base} · every ${row.recurrence_block_weeks} week${row.recurrence_block_weeks === 1 ? '' : 's'}`
  }
  return base
}

function statusBadge(s: Row['status']) {
  if (s === 'approved') return { cls: 'bg-[#E8F0EC] text-[#1A4331] border-[#1A4331]/30', icon: <Check className="h-3 w-3 mr-1" />, label: 'Approved' }
  if (s === 'rejected') return { cls: 'bg-[#FDEDEA] text-[#E06D53] border-[#E06D53]/30', icon: <XIcon className="h-3 w-3 mr-1" />, label: 'Rejected' }
  return { cls: 'bg-[#FDF8EF] text-[#DDA74F] border-[#DDA74F]/30', icon: <Hourglass className="h-3 w-3 mr-1" />, label: 'Pending' }
}

export default function AdminTimeOff() {
  const { user } = useAuth()
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [walkers, setWalkers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterWalker, setFilterWalker] = useState<string>('all')

  // review dialog
  const [review, setReview] = useState<Row | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)

  // admin-create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [form, setForm] = useState<{
    walker_id: string; start_date: string; end_date: string; reason: string; admin_note: string;
    recurrence: 'none' | 'weekly' | 'block'; block_weeks: number; ongoing: boolean;
  }>({ walker_id: '', start_date: '', end_date: '', reason: '', admin_note: '', recurrence: 'none', block_weeks: 2, ongoing: false })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [rowsRes, walkersRes] = await Promise.all([
      supabase.from('walker_unavailability')
        .select('*, walker:profiles!walker_unavailability_walker_id_fkey(full_name, email)')
        .order('status', { ascending: true })  // pending first
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'walker').eq('is_active', true).order('full_name'),
    ])
    setRows((rowsRes.data as Row[]) || [])
    setWalkers((walkersRes.data as any[]) || [])
    setLoading(false)
  }

  function openReview(r: Row) {
    setReview(r)
    setReviewNote(r.admin_note || '')
  }

  async function approve() {
    if (!review) return
    setReviewSaving(true)
    const { data: updated, error } = await supabase.from('walker_unavailability').update({
      status: 'approved',
      admin_note: reviewNote.trim() || null,
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
    }).eq('id', review.id).select('*, walker:profiles!walker_unavailability_walker_id_fkey(full_name, email)').single()
    if (error) { setReviewSaving(false); toast.error('Could not approve: ' + error.message); return }
    await notifyWalkerTimeOff('approved', updated, reviewNote)
    setReviewSaving(false)
    toast.success('Approved — walker notified')
    setReview(null); setReviewNote('')
    fetchAll()
  }

  async function reject() {
    if (!review) return
    if (!reviewNote.trim()) { toast.error('Please add a reason when rejecting'); return }
    setReviewSaving(true)
    const { data: updated, error } = await supabase.from('walker_unavailability').update({
      status: 'rejected',
      admin_note: reviewNote.trim(),
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
    }).eq('id', review.id).select('*, walker:profiles!walker_unavailability_walker_id_fkey(full_name, email)').single()
    if (error) { setReviewSaving(false); toast.error('Could not reject: ' + error.message); return }
    await notifyWalkerTimeOff('rejected', updated, reviewNote)
    setReviewSaving(false)
    toast.success('Rejected — walker notified')
    setReview(null); setReviewNote('')
    fetchAll()
  }

  async function adminDelete(id: string) {
    if (!confirm('Delete this time-off record? The walker will no longer be blocked on these dates.')) return
    const { error } = await supabase.from('walker_unavailability').delete().eq('id', id)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Deleted')
    fetchAll()
  }

  async function adminCreate() {
    if (!form.walker_id) { toast.error('Pick a walker'); return }
    if (!form.start_date) { toast.error('Pick a start date'); return }
    if (!form.ongoing && !form.end_date) { toast.error('Pick an end date (or tick "ongoing")'); return }
    if (!form.ongoing && form.end_date && form.end_date < form.start_date) { toast.error('End date must be after start'); return }
    setCreateSaving(true)
    const payload: any = {
      walker_id: form.walker_id,
      start_date: form.start_date,
      end_date: form.ongoing ? null : form.end_date,
      reason: form.reason.trim() || null,
      admin_note: form.admin_note.trim() || null,
      status: 'approved',               // admin-created is auto-approved
      requested_by: user!.id,
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
    }
    if (form.recurrence === 'weekly') {
      payload.recurrence_type = 'weekly'
      payload.recurrence_weekday = new Date(form.start_date).getDay()
    } else if (form.recurrence === 'block') {
      payload.recurrence_type = 'block'
      payload.recurrence_block_weeks = Math.max(1, Math.min(26, Math.floor(form.block_weeks || 2)))
    }
    const { data: inserted, error } = await supabase.from('walker_unavailability')
      .insert(payload).select('*, walker:profiles!walker_unavailability_walker_id_fkey(full_name, email)').single()
    if (error) { setCreateSaving(false); toast.error('Could not save: ' + error.message); return }
    await notifyWalkerTimeOff('admin_created', inserted, form.admin_note)
    setCreateSaving(false)
    toast.success('Saved — walker notified')
    setCreateOpen(false)
    setForm({ walker_id: '', start_date: '', end_date: '', reason: '', admin_note: '', recurrence: 'none', block_weeks: 2, ongoing: false })
    fetchAll()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const filtered = filterWalker === 'all' ? rows : rows.filter(r => r.walker_id === filterWalker)
  const pending = filtered.filter(r => r.status === 'pending')
  const approved = filtered.filter(r => r.status === 'approved')
  const rejected = filtered.filter(r => r.status === 'rejected')

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6" data-testid="admin-time-off-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Plane className="h-7 w-7 text-[#1A4331]" /> Time off
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">Approve walker requests, or add time off directly on their behalf.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterWalker} onValueChange={setFilterWalker}>
            <SelectTrigger className="w-52" data-testid="filter-walker"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All walkers</SelectItem>
              {walkers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name || w.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)} data-testid="admin-add-time-off">
            <Plus className="h-4 w-4 mr-1" /> Add time off
          </Button>
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="border-[#DDA74F]/40 bg-[#FDF8EF]" data-testid="pending-queue-banner">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#DDA74F]/20 flex items-center justify-center">
                <span className="text-[#DDA74F] font-bold text-sm">{pending.length}</span>
              </div>
              <div>
                <p className="font-medium text-sm">Request{pending.length !== 1 ? 's' : ''} awaiting your review</p>
                <p className="text-xs text-[#5C5C5C]">Walkers are waiting for approval. Open each to approve or reject with a note.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={pending.length > 0 ? 'pending' : 'approved'}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected ({rejected.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          {pending.length === 0
            ? <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">Nothing pending. Nice work.</CardContent></Card>
            : <div className="space-y-2">{pending.map(r => <AdminRow key={r.id} row={r} onReview={openReview} onDelete={adminDelete} />)}</div>}
        </TabsContent>
        <TabsContent value="approved">
          {approved.length === 0
            ? <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">No approved time off yet.</CardContent></Card>
            : <div className="space-y-2">{approved.map(r => <AdminRow key={r.id} row={r} onReview={openReview} onDelete={adminDelete} />)}</div>}
        </TabsContent>
        <TabsContent value="rejected">
          {rejected.length === 0
            ? <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">No rejected requests.</CardContent></Card>
            : <div className="space-y-2">{rejected.map(r => <AdminRow key={r.id} row={r} onReview={openReview} onDelete={adminDelete} />)}</div>}
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={!!review} onOpenChange={() => !reviewSaving && setReview(null)}>
        <DialogContent data-testid="review-time-off-dialog">
          <DialogHeader>
            <DialogTitle>Review time-off request</DialogTitle>
            <DialogDescription>
              {review?.walker?.full_name || 'Walker'} · {review && describe(review)}
            </DialogDescription>
          </DialogHeader>
          {review && (
            <div className="space-y-3">
              {review.reason && (
                <div className="rounded-lg bg-[#F9F8F6] border border-[#E5E3DB] p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-[#8A8A8A] font-semibold mb-1">Walker’s reason</p>
                  <p className="text-[#3C3C3C]">{review.reason}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Note to walker <span className="text-[#8A8A8A] font-normal">(required if rejecting)</span></Label>
                <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional for approval, required for rejection. Walker sees this in-app + via email." data-testid="review-note" />
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            {review?.status === 'pending' ? (
              <>
                <Button variant="outline" className="flex-1 text-[#E06D53] border-[#E06D53] hover:bg-red-50" onClick={reject} disabled={reviewSaving} data-testid="reject-request">
                  <XIcon className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button className="flex-1 bg-[#2D7A5D] hover:bg-[#1A4331]" onClick={approve} disabled={reviewSaving} data-testid="approve-request">
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setReview(null)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !createSaving && setCreateOpen(o)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="admin-create-dialog">
          <DialogHeader>
            <DialogTitle>Add time off for a walker</DialogTitle>
            <DialogDescription>Auto-approved. Walker is notified in-app + email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Walker</Label>
              <Select value={form.walker_id} onValueChange={v => setForm({ ...form, walker_id: v })}>
                <SelectTrigger data-testid="create-walker-select"><SelectValue placeholder="Select walker" /></SelectTrigger>
                <SelectContent>
                  {walkers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name || w.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" min={today} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} data-testid="create-start" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between gap-2">
                  <span>To</span>
                  <label className="flex items-center gap-1 text-[11px] font-normal cursor-pointer">
                    <input type="checkbox" checked={form.ongoing} onChange={e => setForm({ ...form, ongoing: e.target.checked, end_date: e.target.checked ? '' : form.end_date })} className="rounded border-[#E5E3DB]" data-testid="create-ongoing" />
                    ongoing
                  </label>
                </Label>
                <Input type="date" min={form.start_date || today} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} disabled={form.ongoing} data-testid="create-end" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Repeat pattern</Label>
              <div className="grid sm:grid-cols-3 gap-2">
                {([
                  { v: 'none',   label: 'One-off' },
                  { v: 'weekly', label: 'Every week' },
                  { v: 'block',  label: 'Every N weeks' },
                ] as const).map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setForm({ ...form, recurrence: o.v as any })}
                    className={`text-left rounded-lg border p-2 text-sm transition-colors ${form.recurrence === o.v ? 'border-[#1A4331] bg-[#E8F0EC] ring-1 ring-[#1A4331]' : 'border-[#E5E3DB] hover:border-[#1A4331]'}`}
                    data-testid={`create-recurrence-${o.v}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {form.recurrence === 'weekly' && form.start_date && (
                <p className="text-xs text-[#5C5C5C]">Repeats every <strong>{WEEKDAYS[new Date(form.start_date).getDay()]}</strong>.</p>
              )}
              {form.recurrence === 'block' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Repeat every</Label>
                  <Input type="number" min={1} max={26} value={form.block_weeks} onChange={e => setForm({ ...form, block_weeks: parseInt(e.target.value) || 2 })} className="w-20" data-testid="create-block-weeks" />
                  <span className="text-xs text-[#5C5C5C]">weeks</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Reason <span className="text-[#8A8A8A] font-normal">(optional, shown to walker)</span></Label>
              <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} data-testid="create-reason" />
            </div>
            <div className="space-y-1.5">
              <Label>Note to walker <span className="text-[#8A8A8A] font-normal">(optional)</span></Label>
              <Textarea value={form.admin_note} onChange={e => setForm({ ...form, admin_note: e.target.value })} placeholder="e.g. Scheduling a break while we onboard a new regular client — thanks!" data-testid="create-admin-note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancel</Button>
            <Button onClick={adminCreate} disabled={createSaving || !form.walker_id || !form.start_date} data-testid="create-time-off-confirm">
              {createSaving ? 'Saving…' : 'Save & notify walker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminRow({ row, onReview, onDelete }: { row: Row; onReview: (r: Row) => void; onDelete: (id: string) => void }) {
  const b = statusBadge(row.status)
  return (
    <Card className="hover:shadow-sm transition" data-testid={`admin-row-${row.id}`}>
      <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{row.walker?.full_name || 'Walker'}</p>
            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${b.cls}`}>{b.icon}{b.label}</span>
            {row.recurrence_type && <Badge variant="secondary" className="text-[10px]"><Repeat className="h-3 w-3 mr-1" />Recurring</Badge>}
          </div>
          <p className="text-sm text-[#5C5C5C] mt-0.5">{describe(row)}</p>
          {row.reason && <p className="text-xs text-[#8A8A8A] mt-0.5">Reason: {row.reason}</p>}
          {row.admin_note && <p className="text-xs text-[#1A4331]/70 mt-0.5">Note: {row.admin_note}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => onReview(row)} data-testid={`review-${row.id}`}>
            {row.status === 'pending' ? 'Review' : 'Open'}
          </Button>
          <button onClick={() => onDelete(row.id)} className="text-[#E06D53] hover:text-[#C95A41] p-1" aria-label="Delete" data-testid={`delete-${row.id}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
