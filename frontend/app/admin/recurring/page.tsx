'use client'

// Admin overview of every client's recurring-walk template.
// Can pause, extend, or remove — but creation is client-driven.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Repeat, Plus, PauseCircle, PlayCircle, Trash2, Clock, CalendarDays, User, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { WALK_TYPES } from '@/lib/utils'
import { expandTemplateOccurrences } from '@/lib/availability'
import { useAuth } from '@/components/auth/AuthProvider'

const WEEKDAYS = [
  { n: 1, short: 'Mon', label: 'Monday' },
  { n: 2, short: 'Tue', label: 'Tuesday' },
  { n: 3, short: 'Wed', label: 'Wednesday' },
  { n: 4, short: 'Thu', label: 'Thursday' },
  { n: 5, short: 'Fri', label: 'Friday' },
  { n: 6, short: 'Sat', label: 'Saturday' },
  { n: 0, short: 'Sun', label: 'Sunday' },
]

const INITIAL_WEEKS = 8
const EXTEND_WEEKS = 4

type Row = {
  id: string; client_id: string; dog_id: string | null; walker_id: string | null;
  walk_type: string; days_of_week: number[]; scheduled_time: string; duration_minutes: number;
  pickup_address: string | null; notes: string | null;
  start_date: string; end_date: string | null; is_active: boolean; created_at: string;
  client?: { full_name: string | null; email: string | null };
  dog?: { name: string | null };
  walker?: { full_name: string | null };
}

export default function AdminRecurringPage() {
  const supabase = createClient()
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [futureCounts, setFutureCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'paused' | 'all'>('active')

  // Admin create
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [walkers, setWalkers] = useState<any[]>([])
  const [pets, setPets] = useState<any[]>([])
  const [form, setForm] = useState({
    client_id: '', dog_id: '', walker_id: '', walk_type: 'walk_30',
    days: [1, 3, 5] as number[], time: '12:30', pickup: '', notes: '',
    start_date: new Date().toISOString().slice(0, 10), end_date: '', admin_note: '',
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [tplRes, clientsRes, walkersRes, petsRes] = await Promise.all([
      supabase.from('recurring_bookings')
        .select(`*,
          client:profiles!recurring_bookings_client_id_fkey(full_name, email),
          dog:dogs(name),
          walker:profiles!recurring_bookings_walker_id_fkey(full_name)`)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, address').eq('role', 'client').eq('is_active', true).order('full_name'),
      supabase.from('profiles').select('id, full_name').eq('role', 'walker').eq('is_active', true).order('full_name'),
      supabase.from('dogs').select('id, name, breed, owner_id, species').eq('is_active', true),
    ])
    setRows((tplRes.data as Row[] | null) || [])
    setClients(clientsRes.data || [])
    setWalkers(walkersRes.data || [])
    setPets(petsRes.data || [])

    // count upcoming bookings per template
    const today = new Date().toISOString().slice(0, 10)
    const { data: bks } = await supabase.from('bookings')
      .select('recurring_template_id')
      .gte('scheduled_date', today)
      .in('status', ['pending', 'confirmed'])
      .not('recurring_template_id', 'is', null)
    const c: Record<string, number> = {}
    for (const b of bks || []) {
      const k = (b as any).recurring_template_id
      c[k] = (c[k] || 0) + 1
    }
    setFutureCounts(c)
    setLoading(false)
  }

  async function togglePause(t: Row) {
    const { error } = await supabase.from('recurring_bookings').update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) { toast.error('Failed to update'); return }
    if (t.is_active) {
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('bookings').delete()
        .eq('recurring_template_id', t.id)
        .gte('scheduled_date', today)
        .in('status', ['pending', 'confirmed'])
      toast.success('Paused — upcoming bookings cleared')
    } else {
      toast.success('Resumed — client will extend from their side')
    }
    fetchAll()
  }

  async function extend(t: Row) {
    const wt = WALK_TYPES.find(w => w.value === t.walk_type)
    const { data: last } = await supabase.from('bookings')
      .select('scheduled_date').eq('recurring_template_id', t.id)
      .order('scheduled_date', { ascending: false }).limit(1)
    const lastDate = last?.[0]?.scheduled_date as string | undefined
    const startFromIso = lastDate
      ? new Date(new Date(lastDate + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : t.start_date
    const occ = expandTemplateOccurrences({
      start_date: startFromIso,
      end_date: t.end_date || null,
      days_of_week: t.days_of_week,
      weeks_ahead: EXTEND_WEEKS,
    })
    if (occ.length === 0) { toast('No more dates fall within this template'); return }
    const { error } = await supabase.from('bookings').insert(occ.map(d => ({
      client_id: t.client_id, dog_id: t.dog_id, walker_id: t.walker_id,
      scheduled_date: d, scheduled_time: t.scheduled_time,
      walk_type: t.walk_type, duration_minutes: wt?.duration || 30,
      notes: t.notes, pickup_address: t.pickup_address,
      status: 'pending', recurring_template_id: t.id,
    })))
    if (error) { toast.error('Extend failed: ' + error.message); return }
    toast.success(`Added ${occ.length} more bookings`)
    fetchAll()
  }

  async function del(t: Row) {
    if (!confirm(`Stop this regular walk permanently? Upcoming bookings from this template will be cancelled.`)) return
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('bookings').delete()
      .eq('recurring_template_id', t.id)
      .gte('scheduled_date', today)
      .in('status', ['pending', 'confirmed'])
    const { error } = await supabase.from('recurring_bookings').delete().eq('id', t.id)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Template removed')
    fetchAll()
  }

  async function adminCreate() {
    if (!form.client_id) { toast.error('Pick a client'); return }
    if (!form.dog_id) { toast.error('Pick the pet'); return }
    if (form.days.length === 0) { toast.error('Pick at least one day'); return }
    if (!form.start_date) { toast.error('Pick a start date'); return }
    if (form.end_date && form.end_date < form.start_date) { toast.error('End date must be after start'); return }
    const wt = WALK_TYPES.find(w => w.value === form.walk_type)
    setCreating(true)
    const { data: tpl, error: tErr } = await supabase.from('recurring_bookings').insert({
      client_id: form.client_id,
      dog_id: form.dog_id,
      walker_id: form.walker_id || null,
      walk_type: form.walk_type,
      days_of_week: form.days,
      scheduled_time: form.time,
      duration_minutes: wt?.duration || 30,
      pickup_address: form.pickup.trim() || null,
      notes: form.notes.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      is_active: true,
    }).select('*').single()
    if (tErr) { setCreating(false); toast.error('Could not save: ' + tErr.message); return }

    // Auto-confirm (admin is the authority) — generate next 8 weeks as CONFIRMED bookings
    const occurrences = expandTemplateOccurrences({
      start_date: form.start_date,
      end_date: form.end_date || null,
      days_of_week: form.days,
      weeks_ahead: INITIAL_WEEKS,
    })
    if (occurrences.length > 0) {
      const status = form.walker_id ? 'confirmed' : 'pending'
      await supabase.from('bookings').insert(occurrences.map(d => ({
        client_id: form.client_id, dog_id: form.dog_id, walker_id: form.walker_id || null,
        scheduled_date: d, scheduled_time: form.time,
        walk_type: form.walk_type, duration_minutes: wt?.duration || 30,
        notes: form.notes.trim() || null, pickup_address: form.pickup.trim() || null,
        admin_notes: form.admin_note.trim() || null,
        status, recurring_template_id: (tpl as Row).id,
      })))
    }

    // Notify client + (if assigned) walker
    const notifs: any[] = [{
      user_id: form.client_id,
      title: 'Regular walks set up by admin',
      message: `Admin has set up regular walks for ${pets.find(p => p.id === form.dog_id)?.name || 'your pet'} (${occurrences.length} walks over the next ${INITIAL_WEEKS} weeks).${form.admin_note ? ' Note: ' + form.admin_note : ''}`,
      type: 'booking', is_read: false,
    }]
    if (form.walker_id) {
      notifs.push({
        user_id: form.walker_id,
        title: 'Regular walks assigned to you',
        message: `Admin has assigned you regular walks for ${pets.find(p => p.id === form.dog_id)?.name || 'a pet'}: ${form.days.map(n => WEEKDAYS.find(w => w.n === n)!.short).join('/')} at ${form.time}. ${occurrences.length} walks queued.`,
        type: 'booking', is_read: false,
      })
    }
    await supabase.from('notifications').insert(notifs)

    setCreating(false)
    toast.success(`Regular walk created — ${occurrences.length} bookings generated${form.walker_id ? ' and confirmed' : ', pending walker assignment'}`)
    setCreateOpen(false)
    setForm({
      client_id: '', dog_id: '', walker_id: '', walk_type: 'walk_30',
      days: [1, 3, 5], time: '12:30', pickup: '', notes: '',
      start_date: new Date().toISOString().slice(0, 10), end_date: '', admin_note: '',
    })
    fetchAll()
  }

  const petsForClient = form.client_id ? pets.filter(p => p.owner_id === form.client_id) : []

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const filtered = filter === 'all' ? rows : rows.filter(r => r.is_active === (filter === 'active'))
  const activeCount = rows.filter(r => r.is_active).length
  const pausedCount = rows.filter(r => !r.is_active).length

  return (
    <div className="space-y-6" data-testid="admin-recurring-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Repeat className="h-7 w-7 text-[#1A4331]" /> Regular walks
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">
            {activeCount} active · {pausedCount} paused — clients set these up in their own dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-40" data-testid="filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)} data-testid="admin-new-recurring">
            <Plus className="h-4 w-4 mr-1" /> New regular walk
          </Button>
        </div>
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">
          <Repeat className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
          No recurring templates to show.
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {filtered.map(t => {
          const pattern = t.days_of_week.slice().sort()
            .map(n => WEEKDAYS.find(w => w.n === n)?.short).join('/')
          return (
            <Card key={t.id} className={t.is_active ? '' : 'opacity-60'} data-testid={`admin-r-${t.id}`}>
              <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${t.is_active ? 'bg-[#E8F0EC]' : 'bg-[#F2F0EB]'}`}>
                    <Repeat className={`h-6 w-6 ${t.is_active ? 'text-[#1A4331]' : 'text-[#8A8A8A]'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-heading font-semibold">{t.client?.full_name || t.client?.email || 'Client removed'} · {t.dog?.name || 'Pet removed'}</p>
                      {t.is_active ? <Badge variant="success" className="text-[10px]">Active</Badge> : <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
                    </div>
                    <p className="text-sm text-[#5C5C5C] mt-0.5">
                      {t.days_of_week.length}× per week · <strong>{pattern}</strong> at <strong className="font-mono">{t.scheduled_time.slice(0, 5)}</strong>
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-[#8A8A8A] flex-wrap">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{t.duration_minutes}-min</span>
                      {t.walker?.full_name
                        ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {t.walker.full_name}</span>
                        : <span>· any walker</span>}
                      {t.end_date && <span>· until {t.end_date}</span>}
                    </div>
                    {t.is_active && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#1A4331]">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <strong>{futureCounts[t.id] || 0}</strong> upcoming booking{(futureCounts[t.id] || 0) === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.is_active && (
                    <Button size="sm" variant="outline" onClick={() => extend(t)} data-testid={`admin-extend-${t.id}`}>
                      <Plus className="h-3 w-3 mr-1" /> Extend {EXTEND_WEEKS}w
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => togglePause(t)} data-testid={`admin-toggle-${t.id}`}>
                    {t.is_active ? <><PauseCircle className="h-3 w-3 mr-1" /> Pause</> : <><PlayCircle className="h-3 w-3 mr-1" /> Resume</>}
                  </Button>
                  <button onClick={() => del(t)} className="text-[#E06D53] hover:text-[#C95A41] p-1.5 rounded-md hover:bg-red-50" aria-label="Delete" data-testid={`admin-delete-${t.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Admin create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto" data-testid="admin-create-recurring">
          <DialogHeader>
            <DialogTitle>New regular walk (admin)</DialogTitle>
            <DialogDescription>
              Create a recurring walk on behalf of a client. If you assign a walker here, the first {INITIAL_WEEKS} weeks are auto-confirmed; otherwise they’re created as pending for review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v, dog_id: '' })}>
                  <SelectTrigger data-testid="a-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pet</Label>
                <Select value={form.dog_id} onValueChange={v => setForm({ ...form, dog_id: v })} disabled={!form.client_id}>
                  <SelectTrigger data-testid="a-pet"><SelectValue placeholder={form.client_id ? 'Select pet' : 'Pick client first'} /></SelectTrigger>
                  <SelectContent>
                    {petsForClient.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.breed || p.species})</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.client_id && petsForClient.length === 0 && (
                  <p className="text-xs text-[#E06D53]">This client has no pets on file.</p>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Walker (optional)</Label>
                <Select value={form.walker_id || '__any'} onValueChange={v => setForm({ ...form, walker_id: v === '__any' ? '' : v })}>
                  <SelectTrigger data-testid="a-walker"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Leave unassigned (pending)</SelectItem>
                    {walkers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Walk type</Label>
                <Select value={form.walk_type} onValueChange={v => setForm({ ...form, walk_type: v })}>
                  <SelectTrigger data-testid="a-walk-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WALK_TYPES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Days of the week</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map(d => {
                  const on = form.days.includes(d.n)
                  return (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() => setForm({ ...form, days: on ? form.days.filter(x => x !== d.n) : [...form.days, d.n].sort() })}
                      className={`h-12 rounded-lg border text-xs font-semibold transition-all ${on ? 'bg-[#1A4331] text-white border-[#1A4331] shadow-sm' : 'bg-white border-[#E5E3DB] text-[#5C5C5C] hover:border-[#1A4331]'}`}
                      data-testid={`a-day-${d.n}`}
                    >
                      {d.short}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} data-testid="a-time" />
              </div>
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} data-testid="a-start" />
              </div>
              <div className="space-y-1.5">
                <Label>End (optional)</Label>
                <Input type="date" min={form.start_date} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} data-testid="a-end" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pickup address</Label>
              <Input value={form.pickup} onChange={e => setForm({ ...form, pickup: e.target.value })} data-testid="a-pickup" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Walker notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Anything the walker should know every time" data-testid="a-notes" />
              </div>
              <div className="space-y-1.5">
                <Label>Admin note to client/walker</Label>
                <Textarea value={form.admin_note} onChange={e => setForm({ ...form, admin_note: e.target.value })} placeholder="Shown to the client on their notification" data-testid="a-admin-note" />
              </div>
            </div>

            {form.client_id && form.dog_id && form.days.length > 0 && (
              <div className="rounded-lg bg-[#E8F0EC] border border-[#1A4331]/20 p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1A4331] shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {form.days.map(n => WEEKDAYS.find(w => w.n === n)!.short).join('/')} {form.time}{' '}
                    walks for {pets.find(p => p.id === form.dog_id)?.name}
                    {form.walker_id ? ` · walker ${walkers.find(w => w.id === form.walker_id)?.full_name}` : ' · awaiting walker'}
                  </p>
                  <p className="text-xs text-[#5C5C5C] mt-0.5">We’ll create the first {INITIAL_WEEKS} weeks of bookings immediately.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={adminCreate} disabled={creating || !form.client_id || !form.dog_id || form.days.length === 0} data-testid="a-save">
              {creating ? 'Saving…' : 'Create regular walk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
