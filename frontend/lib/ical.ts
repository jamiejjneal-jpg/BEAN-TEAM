// iCal (RFC 5545) generator for booking exports.
// Produces a downloadable .ics file the client can drop into Apple
// Calendar / Google Calendar / Outlook so booked walks appear on their
// personal calendar automatically.

const PRODID = "-//Rocky's Retreat and Rambles//Bookings//EN"

function pad(n: number) { return n < 10 ? '0' + n : '' + n }

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

// Escape per RFC 5545
function esc(s: string | null | undefined): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export interface ICalBooking {
  id: string
  scheduled_date: string  // 'YYYY-MM-DD'
  scheduled_time: string  // 'HH:MM' or 'HH:MM:SS'
  duration_minutes?: number | null
  walk_type?: string | null
  notes?: string | null
  pickup_address?: string | null
  dog?: { name?: string | null } | null
  walker?: { full_name?: string | null } | null
  client?: { full_name?: string | null } | null
}

function buildEvent(b: ICalBooking): string {
  const dt = new Date(`${b.scheduled_date}T${b.scheduled_time.length === 5 ? b.scheduled_time + ':00' : b.scheduled_time}`)
  const dur = b.duration_minutes || 30
  const dtEnd = new Date(dt.getTime() + dur * 60 * 1000)
  const subject = `${b.dog?.name ? b.dog.name + ' — ' : ''}${b.walk_type || 'Walk'}`
  const desc = [
    b.client?.full_name ? `Client: ${b.client.full_name}` : '',
    b.walker?.full_name ? `Walker: ${b.walker.full_name}` : '',
    b.dog?.name ? `Pet: ${b.dog.name}` : '',
    b.notes ? `Notes: ${b.notes}` : '',
  ].filter(Boolean).join('\n')

  return [
    'BEGIN:VEVENT',
    `UID:${b.id}@rockysretreatandrambles.com`,
    `DTSTAMP:${toICalDate(new Date())}`,
    `DTSTART:${toICalDate(dt)}`,
    `DTEND:${toICalDate(dtEnd)}`,
    `SUMMARY:${esc(subject)}`,
    `DESCRIPTION:${esc(desc)}`,
    b.pickup_address ? `LOCATION:${esc(b.pickup_address)}` : '',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n')
}

export function buildICalendar(bookings: ICalBooking[], calendarName = "Rocky's Bookings"): string {
  const events = bookings.map(buildEvent).join('\r\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calendarName)}`,
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Trigger a download of the .ics file in the browser. */
export function downloadICS(bookings: ICalBooking[], filename = 'rockys-bookings.ics', calendarName?: string) {
  const ics = buildICalendar(bookings, calendarName)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
