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
import { Plus, Loader2 } from 'lucide-react'

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
  const supabase = createClient()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [bookingsRes, walkersRes, clientsRes, dogsRes] = await Promise.all([
      supabase.from('bookings').select('*, client:profiles!bookings_client_id_fkey(full_name, email), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name, breed)').order('scheduled_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'walker').eq('is_active', true),
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
    const { error } = await supabase.from('bookings').update({
      status: 'cancelled',
      admin_notes: adminNotes,
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

  function openBooking(booking: any) {
    setSelected(booking)
    setAssignWalker(booking.walker_id || '')
    setAdminNotes(booking.admin_notes || '')
  }

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
                        <td className="py-3 px-4">{WALK_TYPES.find(w => w.value === booking.walk_type)?.label || booking.walk_type}</td>
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
                <Label>Assign Walker</Label>
                <Select value={assignWalker} onValueChange={setAssignWalker}>
                  <SelectTrigger data-testid="assign-walker-select">
                    <SelectValue placeholder="Select walker" />
                  </SelectTrigger>
                  <SelectContent>
                    {walkers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    {walkers.map(w => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
    </div>
  )
}
