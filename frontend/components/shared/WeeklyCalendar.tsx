'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Printer, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Clock, UserCheck, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { logAudit } from '@/lib/audit'
import { formatTime } from '@/lib/utils'

// ---- Time helpers -----------------------------------------------------
export function startOfWeek(d: Date) {
  const day = d.getDay()
  const diffToMon = (day + 6) % 7
  const mon = new Date(d)
  mon.setHours(0, 0, 0, 0)
  mon.setDate(d.getDate() - diffToMon)
  return mon
}
export function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
export function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-amber-100 border-amber-300 text-amber-900',
  confirmed:   'bg-blue-100 border-blue-300 text-blue-900',
  in_progress: 'bg-emerald-100 border-emerald-300 text-emerald-900',
  completed:   'bg-green-100 border-green-300 text-green-900',
  cancelled:   'bg-red-100 border-red-300 text-red-900 line-through',
}

// ---- Category mapping -------------------------------------------------
type CategoryKey = 'walks' | 'training' | 'daycare' | 'overnight' | 'keys' | 'errands' | 'admin' | 'other'
const CATEGORIES: { key: CategoryKey; label: string; dot: string; pill: string; print: string }[] = [
  { key: 'walks',     label: 'Walks',           dot: 'bg-emerald-500', pill: 'bg-emerald-50 border-emerald-300 text-emerald-800', print: '#059669' },
  { key: 'training',  label: 'Training / 1-2-1',dot: 'bg-indigo-500',  pill: 'bg-indigo-50 border-indigo-300 text-indigo-800',    print: '#4F46E5' },
  { key: 'daycare',   label: 'Day care',        dot: 'bg-amber-500',   pill: 'bg-amber-50 border-amber-300 text-amber-800',       print: '#D97706' },
  { key: 'overnight', label: 'Overnight / sit', dot: 'bg-purple-500',  pill: 'bg-purple-50 border-purple-300 text-purple-800',    print: '#9333EA' },
  { key: 'keys',      label: 'Keys / handover', dot: 'bg-sky-500',     pill: 'bg-sky-50 border-sky-300 text-sky-800',             print: '#0284C7' },
  { key: 'errands',   label: 'Errands / visits',dot: 'bg-pink-500',    pill: 'bg-pink-50 border-pink-300 text-pink-800',          print: '#DB2777' },
  { key: 'admin',     label: 'Admin notes',     dot: 'bg-[#8A8A8A]',   pill: 'bg-[#F2F0EB] border-[#C9C4B5] text-[#5C5C5C]',      print: '#8A8A8A' },
  { key: 'other',     label: 'Other',           dot: 'bg-slate-400',   pill: 'bg-slate-50 border-slate-300 text-slate-700',       print: '#64748B' },
]
function categoryOf(walkType?: string | null): CategoryKey {
  if (!walkType) return 'other'
  if (walkType.startsWith('walk') || walkType === 'puppy_visit') return 'walks'
  if (walkType === 'training' || walkType === 'one_to_one')    return 'training'
  if (walkType.startsWith('daycare'))                          return 'daycare'
  if (walkType === 'overnight' || walkType === 'house_sit')    return 'overnight'
  if (walkType.startsWith('key'))                              return 'keys'
  if (walkType === 'pop_in' || walkType === 'vet_visit' || walkType === 'groomer_run' || walkType === 'meet_greet') return 'errands'
  if (walkType === 'admin_note')                               return 'admin'
  return 'other'
}

// ---- Conflict detection ----------------------------------------------
// Two bookings conflict if they share a walker AND their time ranges overlap
// on the same date. We compare in minutes-since-midnight to avoid Date quirks.
function minutesOfDay(time?: string | null): number | null {
  if (!time || typeof time !== 'string') return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}
function conflictMap(walks: any[]): Set<string> {
  // Returns the set of booking IDs that conflict with at least one other
  // booking (same walker, overlapping time, same date). Cancelled bookings
  // are ignored.
  const out = new Set<string>()
  const byWalker = new Map<string, any[]>()
  for (const w of walks) {
    if (w.status === 'cancelled') continue
    if (!w.walker_id) continue
    if (!w.scheduled_date) continue
    const key = `${w.walker_id}|${w.scheduled_date}`
    if (!byWalker.has(key)) byWalker.set(key, [])
    byWalker.get(key)!.push(w)
  }
  for (const list of byWalker.values()) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        const aStart = minutesOfDay(a.scheduled_time)
        const bStart = minutesOfDay(b.scheduled_time)
        if (aStart == null || bStart == null) continue
        const aEnd = aStart + (a.duration_minutes || 30)
        const bEnd = bStart + (b.duration_minutes || 30)
        if (aStart < bEnd && bStart < aEnd) {
          out.add(a.id)
          out.add(b.id)
        }
      }
    }
  }
  return out
}

// ---- Props ------------------------------------------------------------
export type CalendarVariant = 'admin' | 'walker' | 'client'

export type WeeklyCalendarProps = {
  variant: CalendarVariant
  userId: string
  title: string
  subtitle?: string
  // Extra Supabase filter applied to the query. We default to the correct one
  // per variant, but callers can override if needed.
  queryFilter?: (q: any) => any
}

// ---- Main component ---------------------------------------------------
export function WeeklyCalendar({ variant, userId, title, subtitle, queryFilter }: WeeklyCalendarProps) {
  const supabase = createClient()
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [walks, setWalks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCats, setActiveCats] = useState<Set<CategoryKey>>(new Set())
  const [resolveTarget, setResolveTarget] = useState<any>(null)
  const [resolving, setResolving] = useState(false)
  const [candidateWalkers, setCandidateWalkers] = useState<{ id: string; full_name: string | null }[]>([])
  const [shiftMinutes, setShiftMinutes] = useState(30)

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  useEffect(() => { run() /* eslint-disable-next-line */ }, [weekStart, userId])

  async function run() {
    setLoading(true)
    let q: any = supabase
      .from('bookings')
      .select('*, client:profiles!bookings_client_id_fkey(full_name, phone), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name, breed)')
      .gte('scheduled_date', isoDate(weekStart))
      .lte('scheduled_date', isoDate(weekEnd))
      .order('scheduled_time', { ascending: true })

    // Variant-specific scoping — RLS also enforces this server-side, but we
    // add the filter client-side too so the query is efficient.
    if (variant === 'walker') q = q.eq('walker_id', userId)
    if (variant === 'client') q = q.eq('client_id', userId)
    if (queryFilter) q = queryFilter(q)

    const { data } = await q
    setWalks(data || [])
    setLoading(false)
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const catCounts = useMemo(() => {
    const m: Record<CategoryKey, number> = { walks: 0, training: 0, daycare: 0, overnight: 0, keys: 0, errands: 0, admin: 0, other: 0 }
    for (const w of walks) m[categoryOf(w.walk_type)]++
    return m
  }, [walks])
  const conflicts = useMemo(() => (variant === 'admin' ? conflictMap(walks) : new Set<string>()), [walks, variant])
  const filteredByDay = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const d of days) m.set(isoDate(d), [])
    for (const w of walks) {
      if (activeCats.size > 0 && !activeCats.has(categoryOf(w.walk_type))) continue
      const k = w.scheduled_date
      if (m.has(k)) m.get(k)!.push(w)
    }
    return m
  }, [days, walks, activeCats])

  function toggleCat(k: CategoryKey) {
    setActiveCats(prev => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k); else s.add(k)
      return s
    })
  }

  // ---- Conflict resolution (admin only) -------------------------------
  async function openResolve(w: any) {
    if (variant !== 'admin') return
    setShiftMinutes(30)
    setResolveTarget(w)
    setCandidateWalkers([])

    // Find walkers who: (a) have availability covering this booking's window
    // on that day-of-week, AND (b) are not already booked in an overlapping
    // slot on that exact date. Anyone left is a safe candidate.
    try {
      const date = new Date(w.scheduled_date)
      const dow = date.getDay() // 0-6 Sun..Sat — matches walker_schedule
      const startM = minutesOfDay(w.scheduled_time) ?? 0
      const endM   = startM + (w.duration_minutes || 30)
      // Format minutes back to HH:MM for Postgres time comparisons
      const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
      const startStr = toTime(startM)
      const endStr   = toTime(endM)

      const { data: slots } = await supabase
        .from('walker_schedule')
        .select('walker_id, walker:profiles!walker_schedule_walker_id_fkey(full_name)')
        .eq('day_of_week', dow)
        .lte('start_time', startStr)
        .gte('end_time', endStr)

      const candidateIds = new Set<string>((slots || []).map((s: any) => s.walker_id))
      candidateIds.delete(w.walker_id) // skip the currently-assigned (conflicting) walker

      // Filter out anyone already busy at that time the same date.
      for (const other of walks) {
        if (!candidateIds.has(other.walker_id)) continue
        if (other.scheduled_date !== w.scheduled_date) continue
        if (other.status === 'cancelled') continue
        const oStart = minutesOfDay(other.scheduled_time)
        if (oStart == null) continue
        const oEnd = oStart + (other.duration_minutes || 30)
        if (oStart < endM && startM < oEnd) candidateIds.delete(other.walker_id)
      }

      const names = (slots || [])
        .filter((s: any) => candidateIds.has(s.walker_id))
        .map((s: any) => ({ id: s.walker_id, full_name: s.walker?.full_name || '—' }))
        // de-dupe (a walker may have several slots on the same day)
        .filter((v: any, i: number, a: any[]) => a.findIndex(x => x.id === v.id) === i)
      setCandidateWalkers(names)
    } catch (e) {
      // Non-fatal — the reschedule option still works
      console.warn('[calendar] candidate lookup failed:', e)
    }
  }

  async function resolveReschedule() {
    if (!resolveTarget) return
    const startM = minutesOfDay(resolveTarget.scheduled_time) ?? 0
    const newStart = startM + shiftMinutes
    if (newStart < 0 || newStart >= 24 * 60) { toast.error('New time goes outside the day — pick a smaller shift.'); return }
    const h = Math.floor(newStart / 60), m = newStart % 60
    const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
    setResolving(true)
    const { error } = await supabase.from('bookings').update({ scheduled_time: newTime }).eq('id', resolveTarget.id)
    setResolving(false)
    if (error) { toast.error('Reschedule failed: ' + error.message); return }
    logAudit({
      action: 'booking_rescheduled', target_type: 'booking', target_id: resolveTarget.id,
      target_name: `${resolveTarget.dog?.name || 'walk'} on ${resolveTarget.scheduled_date}`,
      details: { from: resolveTarget.scheduled_time, to: newTime, reason: 'conflict-resolution', shift_minutes: shiftMinutes },
    })
    toast.success(`Rescheduled by ${shiftMinutes} min`)
    setResolveTarget(null)
    run()
  }

  async function resolveReassign(newWalkerId: string, newWalkerName: string) {
    if (!resolveTarget) return
    setResolving(true)
    const { error } = await supabase.from('bookings').update({ walker_id: newWalkerId }).eq('id', resolveTarget.id)
    setResolving(false)
    if (error) { toast.error('Reassign failed: ' + error.message); return }
    logAudit({
      action: 'booking_reassigned', target_type: 'booking', target_id: resolveTarget.id,
      target_name: `${resolveTarget.dog?.name || 'walk'} on ${resolveTarget.scheduled_date}`,
      details: { from_walker: resolveTarget.walker?.full_name || resolveTarget.walker_id, to_walker: newWalkerName, reason: 'conflict-resolution' },
    })
    toast.success(`Reassigned to ${newWalkerName}`)
    setResolveTarget(null)
    run()
  }

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div className="space-y-6" data-testid={`${variant}-calendar-page`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[#5C5C5C] mt-1 text-sm">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} data-testid="calendar-prev-week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))} data-testid="calendar-this-week">This week</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} data-testid="calendar-next-week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => window.print()} data-testid="calendar-print">
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      <div className="print:block">
        <div className="hidden print:block text-[#1A4331] mb-3">
          <h2 className="text-2xl font-bold">Rocky&apos;s Retreat and Rambles — {title} · {rangeLabel}</h2>
          <p className="text-xs text-[#5C5C5C]">Generated {new Date().toLocaleString()}</p>
        </div>

        <div className="flex items-center justify-between mb-3 print:hidden">
          <p className="text-sm font-medium text-[#1A4331]">{rangeLabel}</p>
          <p className="text-xs text-[#8A8A8A]">{walks.length} booking{walks.length !== 1 ? 's' : ''} this week</p>
        </div>

        {/* Conflict banner (admin only) */}
        {variant === 'admin' && conflicts.size > 0 && (
          <div className="rounded-lg border border-[#E06D53] bg-[#FDEDEA] text-[#7A2D1C] p-3 flex items-start gap-3 mb-3 print:hidden" data-testid="calendar-conflict-banner">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Heads-up — {conflicts.size / 2 >= 1 ? Math.ceil(conflicts.size / 2) : 1} walker schedule conflict{conflicts.size > 2 ? 's' : ''} this week.</p>
              <p className="text-xs text-[#5C5C5C] mt-0.5">Bookings outlined in red share a walker AND overlap in time. Reassign or reschedule to clear the clash.</p>
            </div>
          </div>
        )}

        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden" data-testid="calendar-category-chips">
          <span className="text-xs text-[#8A8A8A]">Filter:</span>
          {CATEGORIES.map(c => {
            const count = catCounts[c.key] || 0
            const active = activeCats.has(c.key)
            if (count === 0 && !active) return null
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCat(c.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 transition-colors ${c.pill} ${active ? 'ring-2 ring-[#1A4331]/40 shadow-sm' : 'opacity-80 hover:opacity-100'}`}
                data-testid={`calendar-chip-${c.key}`}
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
                <span>{c.label}</span>
                <span className="font-mono font-bold">{count}</span>
              </button>
            )
          })}
          {activeCats.size > 0 && (
            <button type="button" onClick={() => setActiveCats(new Set())} className="text-xs text-[#E06D53] underline-offset-2 hover:underline ml-1" data-testid="calendar-clear-filters">
              Clear filters
            </button>
          )}
          {walks.length === 0 && <span className="text-xs text-[#8A8A8A] italic">— nothing booked yet</span>}
        </div>

        {/* Print-only legend */}
        <div className="hidden print:flex flex-wrap items-center gap-3 mb-3 text-[11px]" style={{ color: '#1A4331' }}>
          {CATEGORIES.filter(c => (catCounts[c.key] || 0) > 0).map(c => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c.print }} />
              {c.label} ({catCounts[c.key]})
            </span>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 print:hidden">
              {days.map(d => {
                const list = filteredByDay.get(isoDate(d)) || []
                const isToday = isoDate(d) === isoDate(new Date())
                return (
                  <Card key={isoDate(d)} className={`border ${isToday ? 'border-[#1A4331] ring-2 ring-[#1A4331]/10' : 'border-[#E5E3DB]'}`}>
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-[#1A4331] mb-2">{dayLabel(d)}</p>
                      {list.length === 0 ? (
                        <p className="text-xs text-[#8A8A8A] italic">{activeCats.size > 0 ? 'Nothing in filter' : 'No walks'}</p>
                      ) : (
                        <div className="space-y-2">
                          {list.map(w => {
                            const cat = CATEGORIES.find(c => c.key === categoryOf(w.walk_type))!
                            const clash = conflicts.has(w.id)
                            const clickable = variant === 'admin' && clash
                            return (
                              <div
                                key={w.id}
                                onClick={clickable ? () => openResolve(w) : undefined}
                                role={clickable ? 'button' : undefined}
                                tabIndex={clickable ? 0 : undefined}
                                className={`text-xs rounded border-l-4 px-2 py-1.5 ${STATUS_COLOR[w.status] || 'bg-white border-[#E5E3DB]'} ${clash ? 'ring-2 ring-[#E06D53]' : ''} ${clickable ? 'cursor-pointer hover:ring-[3px] hover:ring-[#E06D53]' : ''}`}
                                style={{ borderLeftColor: cat.print }}
                                data-testid={`calendar-card-${w.id}`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-2 w-2 rounded-full ${cat.dot}`} aria-hidden="true" />
                                  <p className="font-mono font-bold">{formatTime(w.scheduled_time)}</p>
                                  {clash && <span title="Conflicts with another walk for this walker — click to resolve" className="text-[#E06D53]"><AlertTriangle className="h-3 w-3" /></span>}
                                </div>
                                <p className="truncate">🐕 {w.dog?.name || '—'}</p>
                                {variant !== 'client' && <p className="truncate opacity-80">👤 {w.client?.full_name || 'Deleted'}</p>}
                                {variant !== 'walker' && <p className="truncate opacity-80">🚶 {w.walker?.full_name || 'Unassigned'}</p>}
                                {clickable && <p className="text-[10px] mt-1 text-[#E06D53] font-medium">Click to resolve ↗</p>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Print view */}
            <div className="hidden print:block print-calendar">
              {days.map(d => {
                const list = filteredByDay.get(isoDate(d)) || []
                return (
                  <div key={isoDate(d)} className="print-day" style={{ breakInside: 'avoid', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, margin: '10px 0 4px', color: '#1A4331', borderBottom: '1px solid #1A4331', paddingBottom: 2 }}>{dayLabel(d)}</h3>
                    {list.length === 0 ? (
                      <p style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>No walks</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#E8F0EC', color: '#1A4331' }}>
                            <th style={{ textAlign: 'left', padding: '4px 6px', width: 12 }}></th>
                            <th style={{ textAlign: 'left', padding: '4px 6px', width: 60 }}>Time</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Dog</th>
                            {variant !== 'client' && <th style={{ textAlign: 'left', padding: '4px 6px' }}>Client</th>}
                            {variant !== 'client' && <th style={{ textAlign: 'left', padding: '4px 6px' }}>Phone</th>}
                            {variant !== 'walker' && <th style={{ textAlign: 'left', padding: '4px 6px' }}>Walker</th>}
                            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(w => {
                            const cat = CATEGORIES.find(c => c.key === categoryOf(w.walk_type))!
                            return (
                              <tr key={w.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '4px 6px' }}>
                                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: cat.print }} />
                                </td>
                                <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{formatTime(w.scheduled_time)}</td>
                                <td style={{ padding: '4px 6px' }}>{w.dog?.name || '—'}</td>
                                {variant !== 'client' && <td style={{ padding: '4px 6px' }}>{w.client?.full_name || 'Deleted'}</td>}
                                {variant !== 'client' && <td style={{ padding: '4px 6px' }}>{w.client?.phone || ''}</td>}
                                {variant !== 'walker' && <td style={{ padding: '4px 6px' }}>{w.walker?.full_name || 'Unassigned'}</td>}
                                <td style={{ padding: '4px 6px' }}>{w.walk_type}</td>
                                <td style={{ padding: '4px 6px', textTransform: 'capitalize' }}>{w.status}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          aside, header, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* Resolve conflict dialog (admin only) */}
      <Dialog open={!!resolveTarget} onOpenChange={(open) => { if (!open) setResolveTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#E06D53]">
              <AlertTriangle className="h-5 w-5" /> Resolve walker conflict
            </DialogTitle>
            <DialogDescription>
              {resolveTarget && (
                <>
                  <span className="block">
                    <strong>{resolveTarget.dog?.name || 'Walk'}</strong> for <strong>{resolveTarget.client?.full_name || 'client'}</strong> on{' '}
                    <strong>{resolveTarget.scheduled_date}</strong> at <strong>{formatTime(resolveTarget.scheduled_time)}</strong> ({resolveTarget.duration_minutes || 30} min)
                  </span>
                  <span className="block mt-1 text-xs text-[#5C5C5C]">
                    Currently assigned to <strong>{resolveTarget.walker?.full_name || 'an unavailable walker'}</strong>, who has another overlapping booking.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Option A — reschedule */}
            <div className="rounded-lg border border-[#E5E3DB] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-[#1A4331]" />
                <p className="text-sm font-medium">Option A — Shift the start time</p>
              </div>
              <p className="text-xs text-[#5C5C5C] mb-2">Keeps the same walker; bumps the start forward by:</p>
              <div className="flex items-center gap-2 flex-wrap">
                {[15, 30, 45, 60, -15, -30].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setShiftMinutes(m)}
                    className={`text-xs border rounded-full px-2.5 py-1 ${shiftMinutes === m ? 'bg-[#1A4331] text-white border-[#1A4331]' : 'bg-white border-[#E5E3DB] text-[#1A1A1A] hover:border-[#1A4331]'}`}
                    data-testid={`conflict-shift-${m}`}
                  >
                    {m > 0 ? `+${m} min` : `${m} min`}
                  </button>
                ))}
              </div>
              <Button size="sm" className="mt-3 w-full" onClick={resolveReschedule} disabled={resolving} data-testid="conflict-apply-reschedule">
                {resolving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Applying…</> : `Apply (shift by ${shiftMinutes > 0 ? '+' : ''}${shiftMinutes} min)`}
              </Button>
            </div>

            {/* Option B — reassign */}
            <div className="rounded-lg border border-[#E5E3DB] p-3">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-[#1A4331]" />
                <p className="text-sm font-medium">Option B — Reassign to a free walker</p>
              </div>
              {candidateWalkers.length === 0 ? (
                <p className="text-xs text-[#E06D53]">No walkers are both available (per their schedule) AND free at this time. Try Option A or adjust a walker&apos;s availability.</p>
              ) : (
                <>
                  <p className="text-xs text-[#5C5C5C] mb-2">Click a name to reassign — these walkers are on shift and have no clash at this time:</p>
                  <div className="flex flex-wrap gap-2">
                    {candidateWalkers.map(cw => (
                      <button
                        key={cw.id}
                        type="button"
                        onClick={() => resolveReassign(cw.id, cw.full_name || '(unnamed)')}
                        disabled={resolving}
                        className="text-xs rounded-full bg-[#E8F0EC] border border-[#1A4331]/30 text-[#1A4331] px-3 py-1 hover:bg-[#1A4331] hover:text-white transition-colors"
                        data-testid={`conflict-reassign-${cw.id}`}
                      >
                        {cw.full_name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)} disabled={resolving}>
              <X className="h-4 w-4 mr-1.5" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
