'use client'

// Regular walks: clients set templates like "Mon/Wed/Fri 12:30 walk for Max"
// and we roll them out as individual bookings for the next 8 weeks. An
// "Extend 4 more weeks" button lets them push the horizon forward.
// Templates stored in public.recurring_bookings (omnibus migration); every
// generated occurrence is a normal row in public.bookings.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Repeat, Plus, PauseCircle, PlayCircle, Trash2, Clock, CalendarDays, Info, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { WALK_TYPES } from '@/lib/utils'
import { expandTemplateOccurrences } from '@/lib/availability'

const WEEKDAYS: Array<{ n: number; label: string; short: string }> = [
  { n: 1, label: 'Monday',    short: 'Mon' },
  { n: 2, label: 'Tuesday',   short: 'Tue' },
  { n: 3, label: 'Wednesday', short: 'Wed' },
  { n: 4, label: 'Thursday',  short: 'Thu' },
  { n: 5, label: 'Friday',    short: 'Fri' },
  { n: 6, label: 'Saturday',  short: 'Sat' },
  { n: 0, label: 'Sunday',    short: 'Sun' },
]

const INITIAL_WEEKS = 8
const EXTEND_WEEKS  = 4

type Template = {
  id: string
  client_id: string
  dog_id: string | null
  walker_id: string | null
  walk_type: string
  days_of_week: number[]
  scheduled_time: string
  duration_minutes: number
  pickup_address: string | null
  notes: string | null
  start_date: string
  end_date: string | null
  is_active: boolean
  created_at: string
}

export default function ClientRecurringPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const [templates, setTemplates] = useState<Template[]>([])
  const [dogs, setDogs] = useState<any[]>([])
  const [walkers, setWalkers] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // counts of future bookings per template (for display)
  const [futureCounts, setFutureCounts] = useState<Record<string, number>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{
    dog_id: string; walker_id: string; walk_type: string; days: number[];
    time: string; pickup: string; notes: string; start_date: string; end_date: string;
  }>({
    dog_id: '', walker_id: '', walk_type: 'walk_30',
    days: [1, 3, 5], time: '12:30', pickup: '', notes: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
  })

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    const [tplRes, dogsRes, walkersRes, profRes] = await Promise.all([
      supabase.from('recurring_bookings').select('*').eq('client_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('dogs').select('*').eq('owner_id', user!.id).eq('is_active', true),
      supabase.from('profiles').select('id, full_name, walker_profiles(is_available)').eq('role', 'walker').eq('is_active', true),
      supabase.from('profiles').select('address').eq('id', user!.id).maybeSingle(),
    ])
    const tpls = (tplRes.data as Template[] | null) || []
    setTemplates(tpls)
    setDogs(dogsRes.data || [])
    setWalkers((walkersRes.data as any[] | null)?.filter(w => w.walker_profiles?.is_available) || [])
    setProfile(profRes.data)
    if ((profRes.data as any)?.address && !form.pickup) {
      setForm(f => ({ ...f, pickup: (profRes.data as any).address || '' }))
    }
    // Count upcoming bookings per template
    if (tpls.length > 0) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: bks } = await supabase.from('bookings')
        .select('id, recurring_template_id, scheduled_date')
        .eq('client_id', user!.id)
        .gte('scheduled_date', today)
        .in('status', ['pending', 'confirmed'])
      const counts: Record<string, number> = {}
      for (const b of bks || []) {
        const key = (b as any).recurring_template_id || ''
        if (!key) continue
        counts[key] = (counts[key] || 0) + 1
      }
      setFutureCounts(counts)
    }
    setLoading(false)
  }

  const defaultsReady = useMemo(() => dogs.length > 0, [dogs])

  async function createTemplate() {
    if (!form.dog_id) { toast.error('Pick a pet'); return }
    if (form.days.length === 0) { toast.error('Pick at least one day of the week'); return }
    if (!form.start_date) { toast.error('Pick a start date'); return }
    if (form.end_date && form.end_date < form.start_date) { toast.error('End date must be after start'); return }
    const wt = WALK_TYPES.find(w => w.value === form.walk_type)
    setCreating(true)
    // 1) Create template row
    const { data: tpl, error: tErr } = await supabase.from('recurring_bookings').insert({
      client_id: user!.id,
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

    // 2) Expand initial horizon
    const occurrences = expandTemplateOccurrences({
      start_date: form.start_date,
      end_date: form.end_date || null,
      days_of_week: form.days,
      weeks_ahead: INITIAL_WEEKS,
    })
    if (occurrences.length === 0) {
      setCreating(false)
      toast.warning('Saved — no occurrences fall in the next ' + INITIAL_WEEKS + ' weeks yet')
      setCreateOpen(false); resetForm(); fetchAll(); return
    }
    const rows = occurrences.map(d => ({
      client_id: user!.id,
      dog_id: form.dog_id,
      walker_id: form.walker_id || null,
      scheduled_date: d,
      scheduled_time: form.time,
      walk_type: form.walk_type,
      duration_minutes: wt?.duration || 30,
      notes: form.notes.trim() || null,
      pickup_address: form.pickup.trim() || null,
      status: 'pending',
      recurring_template_id: (tpl as Template).id,
    }))
    const { error: bErr } = await supabase.from('bookings').insert(rows)
    if (bErr) { setCreating(false); toast.error('Template saved but bookings failed: ' + bErr.message); return }

    // 3) Notify admins ONCE per template creation
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true)
    if (admins && admins.length > 0) {
      const dogName = dogs.find(d => d.id === form.dog_id)?.name || 'a pet'
      const summary = `${form.days.map(n => WEEKDAYS.find(w => w.n === n)!.short).join('/')} ${form.time} walks for ${dogName}`
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.id,
        title: 'New recurring walk request',
        message: `${occurrences.length} upcoming bookings need approval — ${summary}.`,
        type: 'booking',
        related_booking_id: null,
        is_read: false,
      })))
    }

    setCreating(false)
    toast.success(`Regular walk saved — ${occurrences.length} bookings created for the next ${INITIAL_WEEKS} weeks`)
    setCreateOpen(false)
    resetForm()
    fetchAll()
  }

  function resetForm() {
    setForm({
      dog_id: '', walker_id: '', walk_type: 'walk_30',
      days: [1, 3, 5], time: '12:30',
      pickup: profile?.address || '', notes: '',
      start_date: new Date().toISOString().slice(0, 10), end_date: '',
    })
  }

  async function togglePause(t: Template) {
    const { error } = await supabase.from('recurring_bookings')
      .update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) { toast.error('Failed to update'); return }
    if (t.is_active) {
      // Pausing — remove future pending/confirmed occurrences so admin stops seeing them
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('bookings').delete()
        .eq('client_id', user!.id)
        .eq('recurring_template_id', t.id)
        .gte('scheduled_date', today)
        .in('status', ['pending', 'confirmed'])
      toast.success('Paused — upcoming bookings cleared')
    } else {
      // Resuming — re-expand horizon
      const count = await extendTemplate(t, INITIAL_WEEKS)
      toast.success(`Resumed — ${count} bookings restored`)
    }
    fetchAll()
  }

  async function extendTemplate(t: Template, weeks: number): Promise<number> {
    const wt = WALK_TYPES.find(w => w.value === t.walk_type)
    // Where to start: max(today + 1, last existing occurrence + 1)
    const { data: lastRows } = await supabase.from('bookings')
      .select('scheduled_date').eq('client_id', user!.id)
      .eq('recurring_template_id', t.id)
      .order('scheduled_date', { ascending: false }).limit(1)
    const lastDate = lastRows?.[0]?.scheduled_date as string | undefined
    const startFromIso = lastDate
      ? new Date(new Date(lastDate + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : t.start_date

    const occurrences = expandTemplateOccurrences({
      start_date: startFromIso,
      end_date: t.end_date || null,
      days_of_week: t.days_of_week,
      weeks_ahead: weeks,
    })
    if (occurrences.length === 0) return 0
    const rows = occurrences.map(d => ({
      client_id: t.client_id, dog_id: t.dog_id, walker_id: t.walker_id,
      scheduled_date: d, scheduled_time: t.scheduled_time,
      walk_type: t.walk_type, duration_minutes: wt?.duration || 30,
      notes: t.notes, pickup_address: t.pickup_address,
      status: 'pending', recurring_template_id: t.id,
    }))
    const { error } = await supabase.from('bookings').insert(rows)
    if (error) { toast.error('Extend failed: ' + error.message); return 0 }
    return occurrences.length
  }

  async function extend(t: Template) {
    const count = await extendTemplate(t, EXTEND_WEEKS)
    if (count > 0) toast.success(`Added ${count} more bookings`)
    else toast('No more dates fall within this template\'s range')
    fetchAll()
  }

  async function del(t: Template) {
    if (!confirm('Stop this regular walk permanently? All upcoming (not-yet-completed) bookings from this template will be cancelled.')) return
    // Cancel future occurrences first
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('bookings').delete()
      .eq('client_id', user!.id)
      .eq('recurring_template_id', t.id)
      .gte('scheduled_date', today)
      .in('status', ['pending', 'confirmed'])
    // Then delete template
    const { error } = await supabase.from('recurring_bookings').delete().eq('id', t.id)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Regular walk cancelled')
    fetchAll()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6 max-w-4xl" data-testid="client-recurring-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Repeat className="h-7 w-7 text-[#1A4331]" /> Regular walks
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">Set your recurring pattern once — we’ll book each walk for you. Cancel anytime, extend with one click.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true) }} disabled={!defaultsReady} data-testid="new-recurring">
          <Plus className="h-4 w-4 mr-1" /> New regular walk
        </Button>
      </div>

      {!defaultsReady && (
        <Card className="border-[#DDA74F]/30 bg-[#FDF8EF]">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <Info className="h-5 w-5 text-[#DDA74F] shrink-0" />
            <div><strong>Add a pet first.</strong> Regular walks need a pet on your account. Head to "My Pets" to register one.</div>
          </CardContent>
        </Card>
      )}

      {templates.length === 0 && defaultsReady && (
        <Card className="border-dashed border-2"><CardContent className="py-10 text-center space-y-2">
          <Repeat className="h-10 w-10 mx-auto text-[#D1CFC6]" />
          <p className="text-[#5C5C5C]">No regular walks yet.</p>
          <p className="text-xs text-[#8A8A8A]">Great for school-run lunchtimes, weekday morning strolls, or weekend long walks.</p>
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {templates.map(t => <TemplateCard key={t.id} t={t} dogs={dogs} walkers={walkers} futureCount={futureCounts[t.id] || 0} onTogglePause={togglePause} onExtend={extend} onDelete={del} />)}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto" data-testid="create-recurring-dialog">
          <DialogHeader>
            <DialogTitle>New regular walk</DialogTitle>
            <DialogDescription>
              Set the pattern once. We’ll create the first {INITIAL_WEEKS} weeks of bookings for admin to approve — then you can extend with a click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pet</Label>
                <Select value={form.dog_id} onValueChange={v => setForm({ ...form, dog_id: v })}>
                  <SelectTrigger data-testid="r-pet"><SelectValue placeholder="Select pet" /></SelectTrigger>
                  <SelectContent>
                    {dogs.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.breed || 'Mixed'})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Walk type</Label>
                <Select value={form.walk_type} onValueChange={v => setForm({ ...form, walk_type: v })}>
                  <SelectTrigger data-testid="r-walk-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WALK_TYPES.filter(w => w.clientBookable).map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
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
                      className={`h-12 rounded-lg border text-xs font-semibold transition-all ${on ? 'bg-[#1A4331] text-white border-[#1A4331] shadow-sm' : 'bg-white border-[#E5E3DB] text-[#5C5C5C] hover:border-[#1A4331] hover:text-[#1A4331]'}`}
                      data-testid={`r-day-${d.n}`}
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
                <Input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} data-testid="r-time" />
              </div>
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} data-testid="r-start" />
              </div>
              <div className="space-y-1.5">
                <Label>End date <span className="text-[#8A8A8A] font-normal">(optional)</span></Label>
                <Input type="date" min={form.start_date} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} data-testid="r-end" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Preferred walker <span className="text-[#8A8A8A] font-normal">(optional — admin can reassign)</span></Label>
              <Select value={form.walker_id || '__any'} onValueChange={v => setForm({ ...form, walker_id: v === '__any' ? '' : v })}>
                <SelectTrigger data-testid="r-walker"><SelectValue placeholder="Any available walker" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any available walker</SelectItem>
                  {walkers.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Pickup address</Label>
              <Input value={form.pickup} onChange={e => setForm({ ...form, pickup: e.target.value })} placeholder="Where walker collects your pet" data-testid="r-pickup" />
            </div>

            <div className="space-y-1.5">
              <Label>Notes for walker <span className="text-[#8A8A8A] font-normal">(optional)</span></Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Anything the walker should know every time" data-testid="r-notes" />
            </div>

            {form.dog_id && form.days.length > 0 && (
              <div className="rounded-lg bg-[#E8F0EC] border border-[#1A4331]/20 p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1A4331] shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {form.days.map(n => WEEKDAYS.find(w => w.n === n)!.short).join('/')} {form.time}{' '}
                    walks for {dogs.find(d => d.id === form.dog_id)?.name}
                  </p>
                  <p className="text-xs text-[#5C5C5C] mt-0.5">We’ll create the first {INITIAL_WEEKS} weeks of bookings — admin will approve them.</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={createTemplate} disabled={creating || !form.dog_id || form.days.length === 0} data-testid="r-save">
              {creating ? 'Saving…' : 'Start regular walks'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateCard({
  t, dogs, walkers, futureCount,
  onTogglePause, onExtend, onDelete,
}: {
  t: Template; dogs: any[]; walkers: any[]; futureCount: number;
  onTogglePause: (t: Template) => void;
  onExtend: (t: Template) => void;
  onDelete: (t: Template) => void;
}) {
  const dog = dogs.find(d => d.id === t.dog_id)
  const walker = walkers.find(w => w.id === t.walker_id)
  const dayPattern = t.days_of_week
    .slice().sort()
    .map(n => WEEKDAYS.find(w => w.n === n)?.short || '')
    .join('/')
  const weekCount = t.days_of_week.length
  return (
    <Card className={t.is_active ? '' : 'opacity-60 border-[#DDA74F]/30'}>
      <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${t.is_active ? 'bg-[#E8F0EC]' : 'bg-[#F2F0EB]'}`}>
            <Repeat className={`h-6 w-6 ${t.is_active ? 'text-[#1A4331]' : 'text-[#8A8A8A]'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-heading font-semibold">{dog?.name || 'Pet removed'}</p>
              {t.is_active
                ? <Badge variant="success" className="text-[10px]">Active</Badge>
                : <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
            </div>
            <p className="text-sm text-[#5C5C5C] mt-0.5">
              {weekCount}× per week · <strong>{dayPattern}</strong> at <strong className="font-mono">{t.scheduled_time.slice(0, 5)}</strong>
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-[#8A8A8A] flex-wrap">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {t.duration_minutes}-min {WALK_TYPES.find(w => w.value === t.walk_type)?.label || t.walk_type}</span>
              {walker && <span>· Walker: {walker.full_name}</span>}
              {t.end_date && <span>· until {t.end_date}</span>}
            </div>
            {t.is_active && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#1A4331]">
                <CalendarDays className="h-3.5 w-3.5" />
                {futureCount > 0
                  ? <><strong>{futureCount}</strong> upcoming booking{futureCount === 1 ? '' : 's'} in the queue</>
                  : <span className="text-[#8A8A8A]">No upcoming bookings — tap Extend to roll forward.</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {t.is_active && (
            <Button size="sm" variant="outline" onClick={() => onExtend(t)} data-testid={`extend-${t.id}`}>
              <Plus className="h-3 w-3 mr-1" /> Extend {EXTEND_WEEKS}w
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onTogglePause(t)} data-testid={`toggle-${t.id}`}>
            {t.is_active ? <><PauseCircle className="h-3 w-3 mr-1" /> Pause</> : <><PlayCircle className="h-3 w-3 mr-1" /> Resume</>}
          </Button>
          <button onClick={() => onDelete(t)} className="text-[#E06D53] hover:text-[#C95A41] p-1.5 rounded-md hover:bg-red-50" aria-label="Delete" data-testid={`delete-${t.id}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
