'use client'

// Admin overview of every client's recurring-walk template.
// Can pause, extend, or remove — but creation is client-driven.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Repeat, Plus, PauseCircle, PlayCircle, Trash2, Clock, CalendarDays, User } from 'lucide-react'
import { toast } from 'sonner'
import { WALK_TYPES } from '@/lib/utils'
import { expandTemplateOccurrences } from '@/lib/availability'

const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' },
  { n: 4, short: 'Thu' }, { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 0, short: 'Sun' },
]

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
  const [rows, setRows] = useState<Row[]>([])
  const [futureCounts, setFutureCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'paused' | 'all'>('active')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data } = await supabase
      .from('recurring_bookings')
      .select(`*,
        client:profiles!recurring_bookings_client_id_fkey(full_name, email),
        dog:dogs(name),
        walker:profiles!recurring_bookings_walker_id_fkey(full_name)`)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })
    setRows((data as Row[] | null) || [])

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
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-40" data-testid="filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
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
    </div>
  )
}
