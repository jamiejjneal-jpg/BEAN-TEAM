'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDate, formatTime, BOOKING_STATUSES, WALK_TYPES } from '@/lib/utils'
import { toast } from 'sonner'
import { notify } from '@/lib/notify'
import { logAudit } from '@/lib/audit'
import { Input } from '@/components/ui/input'
import { Plus, Loader2, Repeat, Check, X as XIcon } from 'lucide-react'

export default function AdminBookings() {
  const [bookings, setBookings] = useState<any[]>([])
  const [walkers, setWalkers] = useState<any[]>([])
  const [clientsList, setClientsList] = useState<any[]>([])
  const [dogsList, setDogsList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [assignWalker, setAssignWalker] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newBk, setNewBk] = useState({
    client_id: '', dog_id: '', walker_id: '', scheduled_date: '',
    scheduled_time: '09:00', walk_type: 'walk_30', pickup_address: '', notes: '', admin_notes: '',
  })

  // Bulk recurring-group state
  const [bulk, setBulk] = useState<{ kind: 'approve' | 'decline'; template_id: string; group: any[] } | null>(null)
  const [bulkWalker, setBulkWalker] = useState('')
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const supabase = createClient()

  // Build a walker_id -> date -> count map for active bookings so we can soft-cap
  const walkerLoadByDate = (() => {
    const map = new Map<string, Map<string, number>>()
    for (const b of bookings) {
      if (!b.walker_id) continue
      if (!['pending', 'confirmed', 'in_progress'].includes(b.status)) continue
      const perDay = map.get(b.walker_id) || new Map<string, number>()
      perDay.set(b.scheduled_date, (perDay.get(b.scheduled_date) || 0) + 1)
      map.set(b.walker_id, perDay)
    }
    return map
  })()

  function walkerLoad(walkerId: string, date?: string | null): { count: number; cap: number; over: boolean; near: boolean } {
    const cap = Math.max(1, Number(walkers.find((w: any) => w.id === walkerId)?.walker_profiles?.max_dogs) || 3)
    if (!date) return { count: 0, cap, over: false, near: false }
    const count = walkerLoadByDate.get(walkerId)?.get(date) || 0
    return { count, cap, over: count >= cap, near: count >= cap - 1 && count < cap }
  }

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [bookingsRes, walkersRes, clientsRes, dogsRes] = await Promise.all([
      supabase.from('bookings').select('*, client:profiles!bookings_client_id_fkey(full_name, email), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name, breed), recurring_template:recurring_bookings(id, walker_id, days_of_week, scheduled_time, walk_type)').order('scheduled_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role, walker_profiles(max_dogs)').in('role', ['walker', 'admin']).eq('is_active', true),
      supabase.from('profiles').select('id, full_name, email, address').eq('role', 'client').eq('is_active', true).order('full_name'),
      supabase.from('dogs').select('id, name, breed, owner_id').eq('is_active', true),
    ])
    setBookings(bookingsRes.data || [])
    setWalkers(walkersRes.data || [])
    setClientsList(clientsRes.data || [])
    setDogsList(dogsRes.data || [])
    setLoading(false)
  }

  async function handleCreateBooking() {
    if (!newBk.client_id && !newBk.walker_id) {
      toast.error('Select a client, a walker, or both')
      return
    }
    if (!newBk.scheduled_date) { toast.error('Pick a date'); return }
    const walkType = WALK_TYPES.find(w => w.value === newBk.walk_type)
    // Pet is optional in admin-mode — key handovers, meet & greets, admin notes etc.
    // Only warn (don't block) when a "usually-needs-a-pet" type has none selected.
    if (walkType?.petRequired && newBk.client_id && !newBk.dog_id) {
      const ok = typeof window !== 'undefined' ? window.confirm(
        `${walkType.label} usually involves a pet. Create this booking without one?`
      ) : true
      if (!ok) return
    }
    setSaving(true)
    const { data: inserted, error } = await supabase.from('bookings').insert({
      client_id: newBk.client_id || null,
      dog_id: newBk.dog_id || null,
      walker_id: newBk.walker_id || null,
      scheduled_date: newBk.scheduled_date,
      scheduled_time: newBk.scheduled_time,
      walk_type: newBk.walk_type,
      duration_minutes: walkType?.duration || 30,
      notes: newBk.notes,
      pickup_address: newBk.pickup_address,
      admin_notes: newBk.admin_notes,
      status: newBk.walker_id ? 'confirmed' : 'pending',
    }).select('id').single()
    setSaving(false)
    if (error) { toast.error('Failed to add booking: ' + error.message); return }
    logAudit({ action: 'booking_created', target_type: 'booking', target_id: inserted?.id || null,
      target_name: `${walkType?.label || newBk.walk_type} on ${newBk.scheduled_date}`,
      details: { client_id: newBk.client_id, walker_id: newBk.walker_id || null } })
    toast.success('Booking created')
    setAddOpen(false)
    setNewBk({ client_id: '', dog_id: '', walker_id: '', scheduled_date: '', scheduled_time: '09:00', walk_type: 'walk_30', pickup_address: '', notes: '', admin_notes: '' })
    fetchData()
  }

  async function updateBooking(id: string, updates: any) {
    // Auto-populate cancellation columns when admin flips status to 'cancelled'
    if (updates.status === 'cancelled') {
      updates.cancellation_reason = updates.cancellation_reason || adminNotes || 'Cancelled by admin'
      updates.cancelled_by = (await supabase.auth.getUser()).data.user?.id || null
      updates.cancelled_at = new Date().toISOString()
    }
    const { error } = await supabase.from('bookings').update(updates).eq('id', id)
    if (error) { toast.error('Failed to update'); return }
    toast.success('Booking updated')
    fetchData()
    setSelected(null)
  }

  async function approveBooking(booking: any) {
    if (!assignWalker) {
      toast.error('Please assign a walker before approving')
      return
    }
    const { error } = await supabase.from('bookings').update({
      status: 'confirmed',
      walker_id: assignWalker,
      admin_notes: adminNotes,
    }).eq('id', booking.id)
    if (error) { toast.error('Failed to approve: ' + error.message); return }
    // Notify the client (only if this booking has one)
    if (booking.client_id) {
      await supabase.from('notifications').insert({
        user_id: booking.client_id,
        title: 'Booking Confirmed',
        message: `Your walk request${booking.dog?.name ? ` for ${booking.dog.name}` : ''} on ${formatDate(booking.scheduled_date)} at ${formatTime(booking.scheduled_time)} has been approved${adminNotes ? `. Note from admin: ${adminNotes}` : '.'}`,
        type: 'booking',
        related_booking_id: booking.id,
      })
    }
    toast.success(booking.client_id ? 'Booking approved and client notified' : 'Booking approved')
    notify('client_booking_approved', { booking_id: booking.id, admin_note: adminNotes })
    logAudit({ action: 'booking_approved', target_type: 'booking', target_id: booking.id, target_name: `${booking.dog?.name || 'walk'} on ${booking.scheduled_date}`, details: { admin_note: adminNotes || null, client: booking.client?.email } })
    fetchData(); setSelected(null)
  }

  async function rejectBooking(booking: any) {
    if (!adminNotes || adminNotes.trim().length < 3) {
      toast.error('Please provide a reason in the Admin Notes field')
      return
    }
    const { data: { user: caller } } = await supabase.auth.getUser()
    const { error } = await supabase.from('bookings').update({
      status: 'cancelled',
      admin_notes: adminNotes,
      cancellation_reason: adminNotes,
      cancelled_by: caller?.id || null,
      cancelled_at: new Date().toISOString(),
    }).eq('id', booking.id)
    if (error) { toast.error('Failed to reject: ' + error.message); return }
    if (booking.client_id) {
      await supabase.from('notifications').insert({
        user_id: booking.client_id,
        title: 'Booking Declined',
        message: `Your walk request${booking.dog?.name ? ` for ${booking.dog.name}` : ''} on ${formatDate(booking.scheduled_date)} was declined. Reason: ${adminNotes}`,
        type: 'booking',
        related_booking_id: booking.id,
      })
    }
    toast.success(booking.client_id ? 'Booking rejected and client notified' : 'Booking rejected')
    notify('client_booking_rejected', { booking_id: booking.id, reject_reason: adminNotes })
    logAudit({ action: 'booking_rejected', target_type: 'booking', target_id: booking.id, target_name: `${booking.dog?.name || 'walk'} on ${booking.scheduled_date}`, details: { reject_reason: adminNotes || null, client: booking.client?.email } })
    fetchData(); setSelected(null)
  }

  function openBulk(kind: 'approve' | 'decline', template_id: string, group: any[]) {
    setBulk({ kind, template_id, group })
    // Pre-fill walker from the template or the first booking's walker
    const preferred = group[0]?.recurring_template?.walker_id || group[0]?.walker_id || ''
    setBulkWalker(preferred)
    setBulkNotes('')
  }

  async function submitBulk() {
    if (!bulk) return
    const { kind, group } = bulk
    if (kind === 'approve' && !bulkWalker) { toast.error('Assign a walker before approving the group'); return }
    if (kind === 'decline' && bulkNotes.trim().length < 3) { toast.error('Please give a reason for declining the group'); return }
    setBulkSaving(true)
    const ids = group.map(b => b.id)
    const clientId = group[0]?.client_id || null
    const petName = group[0]?.dog?.name || 'a pet'
    const dateRange = (() => {
      const dates = group.map(b => b.scheduled_date).sort()
      if (dates.length === 1) return formatDate(dates[0])
      return `${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}`
    })()

    if (kind === 'approve') {
      const { error } = await supabase.from('bookings').update({
        status: 'confirmed',
        walker_id: bulkWalker,
        admin_notes: bulkNotes || null,
      }).in('id', ids)
      if (error) { setBulkSaving(false); toast.error('Bulk approve failed: ' + error.message); return }
      if (clientId) {
        await supabase.from('notifications').insert({
          user_id: clientId,
          title: 'Regular walks approved',
          message: `${ids.length} walks for ${petName} (${dateRange}) have been approved${bulkNotes ? `. Note: ${bulkNotes}` : '.'}`,
          type: 'booking',
          related_booking_id: null,
          is_read: false,
        })
      }
      logAudit({
        action: 'bookings_bulk_approved',
        target_type: 'recurring_template',
        target_id: bulk.template_id,
        target_name: `${petName} · ${ids.length} walks`,
        details: { count: ids.length, walker_id: bulkWalker, admin_note: bulkNotes || null },
      })
      toast.success(`Approved ${ids.length} walks in one click — client notified`)
    } else {
      const { data: { user: caller } } = await supabase.auth.getUser()
      const { error } = await supabase.from('bookings').update({
        status: 'cancelled',
        admin_notes: bulkNotes,
        cancellation_reason: bulkNotes,
        cancelled_by: caller?.id || null,
        cancelled_at: new Date().toISOString(),
      }).in('id', ids)
      if (error) { setBulkSaving(false); toast.error('Bulk decline failed: ' + error.message); return }
      if (clientId) {
        await supabase.from('notifications').insert({
          user_id: clientId,
          title: 'Regular walks declined',
          message: `${ids.length} walks for ${petName} (${dateRange}) were declined. Reason: ${bulkNotes}`,
          type: 'booking',
          related_booking_id: null,
          is_read: false,
        })
      }
      logAudit({
        action: 'bookings_bulk_rejected',
        target_type: 'recurring_template',
        target_id: bulk.template_id,
        target_name: `${petName} · ${ids.length} walks`,
        details: { count: ids.length, reason: bulkNotes },
      })
      toast.success(`Declined ${ids.length} walks — client notified`)
    }
    setBulkSaving(false)
    setBulk(null); setBulkWalker(''); setBulkNotes('')
    fetchData()
  }

  function openBooking(booking: any) {
    setSelected(booking)
    setAssignWalker(booking.walker_id || '')
    setAdminNotes(booking.admin_notes || '')
  }

  // Group pending recurring bookings by template_id for bulk-approve UI
  const pendingRecurringGroups = (() => {
    const groups: Record<string, any[]> = {}
    for (const b of bookings) {
      if (b.status !== 'pending' || !b.recurring_template_id) continue
      ;(groups[b.recurring_template_id] ||= []).push(b)
    }
    return Object.entries(groups)
      .map(([tid, grp]) => ({
        template_id: tid,
        group: grp.sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date)),
      }))
      .filter(g => g.group.length >= 2)  // Only show group UI when 2+ bookings
  })()

  const filtered = filterStatus === 'all' ? bookings : bookings.filter(b => b.status === filterStatus)
  const pendingCount = bookings.filter(b => b.status === 'pending').length

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>
  }

  return (
    <div className="space-y-6" data-testid="admin-bookings-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Manage Bookings</h1>
          <p className="text-[#5C5C5C] mt-1">{bookings.length} total booking{bookings.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)} data-testid="add-booking-button">
            <Plus className="h-4 w-4 mr-1.5" /> Add Booking
          </Button>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44" data-testid="filter-status">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {pendingCount > 0 && (
        <Card className="border-[#DDA74F]/40 bg-[#FDF8EF]">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#DDA74F]/20 flex items-center justify-center">
                <span className="text-[#DDA74F] font-bold text-sm">{pendingCount}</span>
              </div>
              <div>
                <p className="font-medium text-sm">Booking{pendingCount !== 1 ? 's' : ''} awaiting your review</p>
                <p className="text-xs text-[#5C5C5C]">Clients are waiting for approval. Open each to assign a walker or decline with a reason.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setFilterStatus('pending')} data-testid="view-pending-button">Review</Button>
          </CardContent>
        </Card>
      )}

      {pendingRecurringGroups.length > 0 && (
        <div className="space-y-2" data-testid="recurring-groups-section">
          <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C] flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Recurring walks pending bulk review</p>
          {pendingRecurringGroups.map(({ template_id, group }) => {
            const first = group[0]
            const daysOfWeek: number[] = first?.recurring_template?.days_of_week || []
            const WK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
            const dayPattern = daysOfWeek.slice().sort().map(n => WK[n]).join('/')
            const time = (first?.scheduled_time || '').slice(0, 5)
            return (
              <Card key={template_id} className="border-[#1A4331]/20 bg-[#E8F0EC]/40" data-testid={`recurring-group-${template_id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">
                      <Repeat className="h-5 w-5 text-[#1A4331]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {first?.client?.full_name || 'Client'} · {first?.dog?.name || 'Pet'}
                        <span className="ml-2 text-xs font-normal text-[#5C5C5C]">
                          {dayPattern && <>{dayPattern} </>}
                          {time && <>at <span className="font-mono">{time}</span></>}
                        </span>
                      </p>
                      <p className="text-xs text-[#5C5C5C] mt-0.5">
                        <strong>{group.length}</strong> pending walks · {formatDate(group[0].scheduled_date)} → {formatDate(group[group.length - 1].scheduled_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-[#E06D53] border-[#E06D53] hover:bg-red-50" onClick={() => openBulk('decline', template_id, group)} data-testid={`bulk-decline-${template_id}`}>
                      <XIcon className="h-3.5 w-3.5 mr-1" /> Decline all
                    </Button>
                    <Button size="sm" className="bg-[#2D7A5D] hover:bg-[#1A4331]" onClick={() => openBulk('approve', template_id, group)} data-testid={`bulk-approve-${template_id}`}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve all {group.length}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-[#8A8A8A]">No bookings found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E3DB] bg-[#F9F8F6]">
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Client</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Pet</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Walker</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Date & Time</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Service</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-[#5C5C5C]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking) => {
                    const status = BOOKING_STATUSES[booking.status as keyof typeof BOOKING_STATUSES]
                    return (
                      <tr key={booking.id} className="border-b border-[#F2F0EB] last:border-0 hover:bg-[#F9F8F6]">
                        <td className="py-3 px-4">{booking.client?.full_name || <span className="text-[#9C8E7A] italic">—</span>}</td>
                        <td className="py-3 px-4">{booking.dog?.name || <span className="text-[#9C8E7A] italic">—</span>}</td>
                        <td className="py-3 px-4">{booking.walker?.full_name || <span className="text-[#E06D53]">Unassigned</span>}</td>
                        <td className="py-3 px-4 font-mono text-xs">{formatDate(booking.scheduled_date)} {formatTime(booking.scheduled_time)}</td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1.5">
                            {WALK_TYPES.find(w => w.value === booking.walk_type)?.label || booking.walk_type}
                            {booking.recurring_template_id && (
                              <span title="Part of a recurring walk template" className="inline-flex items-center gap-0.5 text-[10px] text-[#1A4331] bg-[#E8F0EC] rounded-full px-1.5 py-0.5">
                                <Repeat className="h-2.5 w-2.5" /> recurring
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4"><Badge className={status?.color}>{status?.label}</Badge></td>
                        <td className="py-3 px-4">
                          <Button size="sm" variant="outline" onClick={() => openBooking(booking)} data-testid={`manage-booking-${booking.id}`}>
                            Manage
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Booking</DialogTitle>
            <DialogDescription>
              {selected?.client?.full_name}{selected?.dog?.name ? ` - ${selected.dog.name}` : ''} | {selected && formatDate(selected.scheduled_date)}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-[#8A8A8A]">Type:</span> <span className="capitalize">{selected.walk_type}</span></div>
                <div><span className="text-[#8A8A8A]">Duration:</span> {selected.duration_minutes} min</div>
                <div><span className="text-[#8A8A8A]">Pickup:</span> {selected.pickup_address || 'Not set'}</div>
                <div><span className="text-[#8A8A8A]">Notes:</span> {selected.notes || 'None'}</div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Assign Walker</span>
                  {assignWalker && selected?.scheduled_date && (() => {
                    const load = walkerLoad(assignWalker, selected.scheduled_date)
                    return (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${load.over ? 'bg-[#FDEDEA] text-[#E06D53]' : load.near ? 'bg-[#FDF8EF] text-[#DDA74F]' : 'bg-[#E8F0EC] text-[#1A4331]'}`}>
                        {load.count}/{load.cap} booked on {selected.scheduled_date}
                      </span>
                    )
                  })()}
                </Label>
                <Select value={assignWalker} onValueChange={setAssignWalker}>
                  <SelectTrigger data-testid="assign-walker-select">
                    <SelectValue placeholder="Select walker" />
                  </SelectTrigger>
                  <SelectContent>
                    {walkers.map((w: any) => {
                      const load = walkerLoad(w.id, selected?.scheduled_date || null)
                      return (
                        <SelectItem key={w.id} value={w.id} data-testid={`assign-option-${w.id}${load.over ? '-full' : ''}`}>
                          <span className="flex items-center gap-2">
                            {load.over && <span aria-label="At capacity" title="At capacity — overbook risk">🛑</span>}
                            {load.near && !load.over && <span aria-label="Near capacity" title="Near capacity">⚠️</span>}
                            <span>{w.full_name}{selected?.scheduled_date ? ` — ${load.count}/${load.cap}` : ''}</span>
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {assignWalker && selected?.scheduled_date && walkerLoad(assignWalker, selected.scheduled_date).over && (
                  <p className="text-xs text-[#E06D53]" data-testid="capacity-warning">
                    ⚠ This walker is at their max_dogs capacity for {selected.scheduled_date}. You can still assign, but consider redistributing.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Admin Notes / Reason (required for rejection)</Label>
                <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Internal notes or reason to share with the client..." data-testid="admin-notes-input" />
              </div>

              {selected.status === 'pending' ? (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    onClick={() => approveBooking(selected)}
                    data-testid="approve-booking-button"
                    className="bg-[#2D7A5D] hover:bg-[#1A4331]"
                  >
                    Approve Booking
                  </Button>
                  <Button
                    onClick={() => rejectBooking(selected)}
                    data-testid="reject-booking-button"
                    variant="outline"
                    className="text-[#E06D53] border-[#E06D53] hover:bg-red-50"
                  >
                    Decline with Reason
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Update Status</Label>
                    <div className="flex flex-wrap gap-2">
                      {['confirmed', 'in_progress', 'completed', 'cancelled'].map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={selected.status === s ? 'default' : 'outline'}
                          onClick={() => updateBooking(selected.id, { status: s, walker_id: assignWalker || selected.walker_id, admin_notes: adminNotes })}
                          data-testid={`set-status-${s}`}
                          className="capitalize"
                        >
                          {s.replace('_', ' ')}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={() => updateBooking(selected.id, { walker_id: assignWalker, admin_notes: adminNotes })} data-testid="save-booking-changes" className="w-full">
                    Save Changes
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin: Add booking */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a booking</DialogTitle>
            <DialogDescription>Create a walk on behalf of a client. Assign a walker now to skip approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Client <span className="text-[#8A8A8A] font-normal text-xs">(optional)</span></Label>
                <Select value={newBk.client_id || '__none'} onValueChange={(v) => {
                  if (v === '__none') { setNewBk({ ...newBk, client_id: '', dog_id: '' }); return }
                  const addr = clientsList.find(c => c.id === v)?.address || ''
                  setNewBk({ ...newBk, client_id: v, dog_id: '', pickup_address: newBk.pickup_address || addr })
                }}>
                  <SelectTrigger data-testid="add-booking-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none">No client</SelectItem>
                    {clientsList.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name || '(no name)'} — {c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Walker <span className="text-[#8A8A8A] font-normal text-xs">(optional)</span></Label>
                <Select value={newBk.walker_id || '__none'} onValueChange={(v) => setNewBk({ ...newBk, walker_id: v === '__none' ? '' : v })}>
                  <SelectTrigger data-testid="add-booking-walker"><SelectValue placeholder="Leave pending" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Leave pending (I&apos;ll assign later)</SelectItem>
                    {walkers.map((w: any) => {
                      const load = walkerLoad(w.id, newBk.scheduled_date || null)
                      return (
                        <SelectItem key={w.id} value={w.id}>
                          <span className="flex items-center gap-2">
                            {load.over && <span title="At capacity">🛑</span>}
                            {load.near && !load.over && <span title="Near capacity">⚠️</span>}
                            <span>{w.full_name}{newBk.scheduled_date ? ` — ${load.count}/${load.cap}` : ''}</span>
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {newBk.walker_id && newBk.scheduled_date && walkerLoad(newBk.walker_id, newBk.scheduled_date).over && (
                  <p className="text-xs text-[#E06D53]">
                    ⚠ Walker is at capacity for this date.
                  </p>
                )}
              </div>
            </div>
            {!newBk.client_id && !newBk.walker_id && (
              <p className="text-xs text-[#E06D53]">Pick a client, a walker, or both — a booking needs at least one.</p>
            )}
            {newBk.client_id && (
              <div className="space-y-2">
                {(() => {
                  const wt = WALK_TYPES.find(w => w.value === newBk.walk_type)
                  const req = !!wt?.petRequired
                  return (
                    <>
                      <Label>Pet {req ? <span className="text-[#8A8A8A] font-normal text-xs">(recommended)</span> : <span className="text-[#8A8A8A] font-normal text-xs">(optional)</span>}</Label>
                      <Select value={newBk.dog_id || '__none'} onValueChange={(v) => setNewBk({ ...newBk, dog_id: v === '__none' ? '' : v })}>
                        <SelectTrigger data-testid="add-booking-pet"><SelectValue placeholder="Select pet" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No pet (key move, meet & greet, admin note…)</SelectItem>
                          {dogsList.filter(d => d.owner_id === newBk.client_id).map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name} ({d.breed || 'Mixed'})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {dogsList.filter(d => d.owner_id === newBk.client_id).length === 0 && (
                        <p className="text-xs text-[#8A8A8A]">This client has no active pets yet.</p>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={newBk.scheduled_date} onChange={e => setNewBk({ ...newBk, scheduled_date: e.target.value })} data-testid="add-booking-date" /></div>
              <div className="space-y-2"><Label>Time</Label><Input type="time" value={newBk.scheduled_time} onChange={e => setNewBk({ ...newBk, scheduled_time: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={newBk.walk_type} onValueChange={(v) => setNewBk({ ...newBk, walk_type: v })}>
                <SelectTrigger data-testid="add-booking-service"><SelectValue /></SelectTrigger>
                <SelectContent>{WALK_TYPES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Pickup address</Label><Input value={newBk.pickup_address} onChange={e => setNewBk({ ...newBk, pickup_address: e.target.value })} /></div>
            <div className="space-y-2"><Label>Client notes</Label><Textarea value={newBk.notes} onChange={e => setNewBk({ ...newBk, notes: e.target.value })} /></div>
            <div className="space-y-2"><Label>Admin notes (private)</Label><Textarea value={newBk.admin_notes} onChange={e => setNewBk({ ...newBk, admin_notes: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreateBooking} disabled={saving || (!newBk.client_id && !newBk.walker_id)} data-testid="add-booking-confirm">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</> : 'Create booking'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk approve / decline dialog for recurring groups */}
      <Dialog open={!!bulk} onOpenChange={(o) => !bulkSaving && !o && setBulk(null)}>
        <DialogContent data-testid="bulk-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-[#1A4331]" />
              {bulk?.kind === 'approve' ? 'Approve all recurring walks' : 'Decline all recurring walks'}
            </DialogTitle>
            <DialogDescription>
              {bulk && `${bulk.group.length} pending walks · ${bulk.group[0]?.client?.full_name || 'Client'} · ${bulk.group[0]?.dog?.name || 'Pet'} · ${formatDate(bulk.group[0].scheduled_date)} → ${formatDate(bulk.group[bulk.group.length - 1].scheduled_date)}`}
            </DialogDescription>
          </DialogHeader>
          {bulk && (
            <div className="space-y-3">
              {bulk.kind === 'approve' && (
                <div className="space-y-1.5">
                  <Label>Assign walker to all {bulk.group.length} walks</Label>
                  <Select value={bulkWalker} onValueChange={setBulkWalker}>
                    <SelectTrigger data-testid="bulk-walker"><SelectValue placeholder="Select walker" /></SelectTrigger>
                    <SelectContent>
                      {walkers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {bulk.group[0]?.recurring_template?.walker_id && (
                    <p className="text-xs text-[#8A8A8A]">Client's preferred walker is pre-selected.</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>
                  Note to client{' '}
                  <span className="text-[#8A8A8A] font-normal">
                    {bulk.kind === 'decline' ? '(required — reason for declining)' : '(optional — shown on their booking)'}
                  </span>
                </Label>
                <Textarea value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} data-testid="bulk-notes" placeholder={bulk.kind === 'decline' ? 'Explain why — e.g. walker capacity, dates clash, etc.' : 'Welcome your new regular!'} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBulk(null)} disabled={bulkSaving}>Cancel</Button>
            <Button
              onClick={submitBulk}
              disabled={bulkSaving}
              className={bulk?.kind === 'decline' ? 'bg-[#E06D53] hover:bg-[#C95A41]' : 'bg-[#2D7A5D] hover:bg-[#1A4331]'}
              data-testid="bulk-submit"
            >
              {bulkSaving
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Working…</>
                : bulk?.kind === 'approve' ? `Approve all ${bulk?.group.length}` : `Decline all ${bulk?.group.length}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
