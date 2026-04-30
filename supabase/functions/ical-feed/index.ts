// supabase/functions/ical-feed/index.ts
// Live-updating iCal feed. Clients, walkers, and admins each get a
// role-scoped view of upcoming bookings via a private token URL:
//
//   https://<PROJECT>.functions.supabase.co/ical-feed?token=UUID
//
// Apple/Google/Outlook calendar clients poll this URL every few
// hours so edits made in the app flow through automatically.
//
// Scope:
//   - client  => bookings where client_id = token owner
//   - walker  => bookings where walker_id = token owner
//   - admin   => every booking (master schedule)
//
// The function uses the service role to read the owner profile and
// bookings, so no authentication header is required on the caller.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PRODID = "-//Rocky's Retreat and Rambles//Bookings//EN"

// ---- helpers ---------------------------------------------------------
const pad = (n: number) => (n < 10 ? '0' : '') + n

function toICalDate(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function esc(s: string | null | undefined): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function fold(line: string): string {
  // iCal spec: lines >75 octets must be folded with CRLF + space.
  if (line.length <= 75) return line
  const out: string[] = []
  for (let i = 0; i < line.length; i += 73) {
    out.push((i === 0 ? '' : ' ') + line.slice(i, i + 73))
  }
  return out.join('\r\n')
}

type Booking = {
  id: string
  scheduled_date: string
  scheduled_time: string
  duration_minutes: number | null
  walk_type: string | null
  notes: string | null
  pickup_address: string | null
  status: string
  dog: { name: string | null } | null
  walker: { full_name: string | null } | null
  client: { full_name: string | null } | null
}

function buildEvent(b: Booking): string {
  const dt = new Date(
    `${b.scheduled_date}T${b.scheduled_time.length === 5 ? b.scheduled_time + ':00' : b.scheduled_time}`,
  )
  if (Number.isNaN(dt.getTime())) return ''
  const dur = b.duration_minutes || 30
  const dtEnd = new Date(dt.getTime() + dur * 60 * 1000)
  const subject = `${b.dog?.name ? b.dog.name + ' — ' : ''}${b.walk_type || 'Walk'}${
    b.status && b.status !== 'confirmed' ? ` (${b.status})` : ''
  }`
  const desc = [
    b.client?.full_name ? `Client: ${b.client.full_name}` : '',
    b.walker?.full_name ? `Walker: ${b.walker.full_name}` : '',
    b.dog?.name ? `Pet: ${b.dog.name}` : '',
    b.notes ? `Notes: ${b.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    'BEGIN:VEVENT',
    `UID:${b.id}@rockysretreatandrambles.com`,
    `DTSTAMP:${toICalDate(new Date())}`,
    `DTSTART:${toICalDate(dt)}`,
    `DTEND:${toICalDate(dtEnd)}`,
    fold(`SUMMARY:${esc(subject)}`),
    fold(`DESCRIPTION:${esc(desc)}`),
    b.pickup_address ? fold(`LOCATION:${esc(b.pickup_address)}`) : '',
    'STATUS:' + (b.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'),
    'END:VEVENT',
  ]
    .filter(Boolean)
    .join('\r\n')
}

function buildCalendar(name: string, events: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(name)}`),
    'X-PUBLISHED-TTL:PT2H',
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

// ---- server ----------------------------------------------------------
const icalHeaders = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return new Response('Missing ?token', { status: 400 })

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1) Look up token → owner
  const { data: tk, error: tkErr } = await supa
    .from('calendar_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle()
  if (tkErr) return new Response(tkErr.message, { status: 500 })
  if (!tk) return new Response('Invalid token', { status: 404 })

  // 2) Owner role + name
  const { data: profile } = await supa
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', tk.user_id)
    .single()
  if (!profile) return new Response('Profile not found', { status: 404 })

  // 3) Role-scoped bookings (next 12 months)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)

  let q = supa
    .from('bookings')
    .select(
      'id, scheduled_date, scheduled_time, duration_minutes, walk_type, notes, pickup_address, status, dog:dogs(name), walker:profiles!bookings_walker_id_fkey(full_name), client:profiles!bookings_client_id_fkey(full_name)',
    )
    .gte('scheduled_date', today.toISOString().slice(0, 10))
    .lte('scheduled_date', horizon.toISOString().slice(0, 10))
    .neq('status', 'cancelled')
    .order('scheduled_date')
    .order('scheduled_time')

  if (profile.role === 'client') q = q.eq('client_id', tk.user_id)
  else if (profile.role === 'walker') q = q.eq('walker_id', tk.user_id)
  // admin => no extra filter, sees everything

  const { data: bookings, error: bErr } = await q
  if (bErr) return new Response(bErr.message, { status: 500 })

  const events = (bookings as Booking[] || [])
    .map(buildEvent)
    .filter(Boolean)
    .join('\r\n')

  const calName =
    profile.role === 'admin'
      ? "Rocky's — Master Schedule"
      : profile.role === 'walker'
        ? `Rocky's — ${profile.full_name || 'Walker'}'s Walks`
        : `Rocky's — ${profile.full_name || 'Client'}'s Bookings`

  // 4) Light-touch bookkeeping (ignore errors)
  supa.from('calendar_tokens').update({ last_used_at: new Date().toISOString() }).eq('token', token).then()

  return new Response(buildCalendar(calName, events), { headers: icalHeaders })
})
