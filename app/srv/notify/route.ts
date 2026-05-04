import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  sendAdminNewBookingAlert,
  sendClientBookingApproved,
  sendClientBookingRejected,
  sendClientPickup,
  sendClientDropoff,
} from '@/lib/email'

export const dynamic = 'force-dynamic'

// Single secure endpoint for sending event emails. The server re-fetches
// booking details to prevent tampering and enforces role-based access on
// each event type.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { event, booking_id, admin_note, reject_reason } = body as {
    event?: string; booking_id?: string; admin_note?: string; reject_reason?: string
  }

  if (!event || !booking_id) {
    return NextResponse.json({ error: 'event and booking_id required' }, { status: 400 })
  }

  // Fetch booking with related names/emails
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, client_id, walker_id, scheduled_date, scheduled_time, walk_type, notes, client:profiles!bookings_client_id_fkey(full_name, email), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name)')
    .eq('id', booking_id)
    .maybeSingle()

  if (bErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  const b: any = booking

  // Caller's role
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = me?.role

  switch (event) {
    case 'admin_new_booking': {
      // Only the client who owns the booking can trigger this
      if (user.id !== b.client_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const { data: admins } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'admin')
        .eq('is_active', true)
      const to = (admins || []).map((a: any) => a.email).filter(Boolean)
      if (to.length === 0) return NextResponse.json({ ok: true, skipped: 'no admins' })
      await sendAdminNewBookingAlert({
        to,
        dogName: b.dog?.name || 'a dog',
        clientName: b.client?.full_name || 'A client',
        scheduledDate: b.scheduled_date,
        scheduledTime: b.scheduled_time,
        walkType: b.walk_type,
        notes: b.notes,
      })
      return NextResponse.json({ ok: true })
    }

    case 'client_booking_approved': {
      if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!b.client?.email) return NextResponse.json({ ok: true, skipped: 'no client email' })
      await sendClientBookingApproved({
        to: b.client.email,
        clientName: b.client.full_name,
        dogName: b.dog?.name || 'your dog',
        walkerName: b.walker?.full_name,
        scheduledDate: b.scheduled_date,
        scheduledTime: b.scheduled_time,
        note: admin_note,
      })
      return NextResponse.json({ ok: true })
    }

    case 'client_booking_rejected': {
      if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!b.client?.email) return NextResponse.json({ ok: true, skipped: 'no client email' })
      await sendClientBookingRejected({
        to: b.client.email,
        clientName: b.client.full_name,
        dogName: b.dog?.name || 'your dog',
        scheduledDate: b.scheduled_date,
        reason: reject_reason || 'Please contact us for more details.',
      })
      return NextResponse.json({ ok: true })
    }

    case 'client_pickup': {
      if (user.id !== b.walker_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!b.client?.email) return NextResponse.json({ ok: true, skipped: 'no client email' })
      await sendClientPickup({
        to: b.client.email,
        clientName: b.client.full_name,
        dogName: b.dog?.name || 'your dog',
        walkerName: b.walker?.full_name,
      })
      return NextResponse.json({ ok: true })
    }

    case 'client_dropoff': {
      if (user.id !== b.walker_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!b.client?.email) return NextResponse.json({ ok: true, skipped: 'no client email' })
      await sendClientDropoff({
        to: b.client.email,
        clientName: b.client.full_name,
        dogName: b.dog?.name || 'your dog',
        walkerName: b.walker?.full_name,
      })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  }
}
