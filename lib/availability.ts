// Unavailability + recurring-booking helpers
// Pure date math. Fetches approved walker_unavailability rows client-side and
// computes which walkers are unavailable on a given date, taking one-off,
// weekly-recurring and block-N-weeks patterns into account.

import { createClient } from '@/lib/supabase/client'

export type UnavailRow = {
  id: string
  walker_id: string
  start_date: string
  end_date: string | null
  status: 'pending' | 'approved' | 'rejected'
  recurrence_type: 'weekly' | 'block' | null
  recurrence_weekday: number | null
  recurrence_block_weeks: number | null
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Return true if the walker is blocked on `isoDate` (YYYY-MM-DD) based on an
 * APPROVED row.
 */
export function rowBlocksDate(row: UnavailRow, isoDate: string): boolean {
  if (row.status !== 'approved') return false
  if (isoDate < row.start_date) return false
  const endIso = row.end_date
  const isoDay = new Date(isoDate + 'T00:00:00')
  const startDay = new Date(row.start_date + 'T00:00:00')

  if (!row.recurrence_type) {
    // One-off: inside start..end (inclusive) or ongoing
    if (endIso && isoDate > endIso) return false
    return true
  }

  if (row.recurrence_type === 'weekly') {
    // Applies every week on the same weekday as start_date (or explicit weekday)
    const dow = row.recurrence_weekday ?? startDay.getDay()
    if (isoDay.getDay() !== dow) return false
    if (endIso && isoDate > endIso) return false
    return true
  }

  if (row.recurrence_type === 'block') {
    // The 'block' is from start_date to end_date (or 1 day if end is null).
    const blockLen = endIso ? daysBetween(startDay, new Date(endIso + 'T00:00:00')) + 1 : 1
    const periodDays = Math.max(1, (row.recurrence_block_weeks ?? 2)) * 7
    // Project forward: figure out which block occurrence isoDay falls in
    const delta = daysBetween(startDay, isoDay)
    const modulo = ((delta % periodDays) + periodDays) % periodDays
    if (modulo < blockLen) {
      // also respect 'ongoing-by-end_date' semantics: if end_date is set,
      // stop repeating after end_date? That interpretation feels odd for a
      // 'block every N weeks'. Convention here: end_date is the END of the
      // *first* block — subsequent blocks keep recurring indefinitely.
      return true
    }
    return false
  }

  return false
}

/**
 * Fetch all approved unavailability rows for the given walker IDs and return a
 * Set of walker_id values that should be treated as unavailable on `isoDate`.
 */
export async function walkersUnavailableOn(walkerIds: string[], isoDate: string): Promise<Set<string>> {
  const result = new Set<string>()
  if (walkerIds.length === 0 || !isoDate) return result
  const supabase = createClient()
  const { data } = await supabase
    .from('walker_unavailability')
    .select('id, walker_id, start_date, end_date, status, recurrence_type, recurrence_weekday, recurrence_block_weeks')
    .in('walker_id', walkerIds)
    .eq('status', 'approved')
  for (const row of (data as UnavailRow[] | null) || []) {
    if (rowBlocksDate(row, isoDate)) result.add(row.walker_id)
  }
  return result
}

/* ----- Recurring bookings helpers ------------------------------------ */

const WEEK = 7 * 24 * 60 * 60 * 1000

export function expandTemplateOccurrences(opts: {
  start_date: string        // ISO YYYY-MM-DD
  end_date?: string | null  // optional cap
  days_of_week: number[]    // 0=Sun..6=Sat
  weeks_ahead: number       // generate this many weeks forward from today
}): string[] {
  const { start_date, end_date, days_of_week, weeks_ahead } = opts
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(start_date + 'T00:00:00')
  const horizon = new Date(Math.max(today.getTime(), start.getTime()))
  const stop = new Date(today.getTime() + weeks_ahead * WEEK)
  const capStop = end_date ? new Date(end_date + 'T00:00:00') : null
  const real_stop = capStop && capStop < stop ? capStop : stop

  const out: string[] = []
  const cursor = new Date(horizon)
  while (cursor <= real_stop) {
    if (days_of_week.includes(cursor.getDay()) && cursor >= start) {
      const iso = cursor.toISOString().slice(0, 10)
      out.push(iso)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * After a walker marks a booking 'completed', auto-extend the linked
 * recurring template's horizon if fewer than `MIN_WEEKS_AHEAD` weeks
 * of pending/confirmed occurrences remain. Best-effort: silent no-op
 * on any error so it never interferes with the walk-completion UX.
 *
 * Returns how many new bookings were created (0 if nothing to do).
 */
export async function autoExtendIfLow(booking: {
  id: string
  recurring_template_id: string | null
}): Promise<number> {
  if (!booking.recurring_template_id) return 0
  const supabase = createClient()
  const MIN_WEEKS_AHEAD = 2
  const EXTEND_WEEKS = 4
  const today = new Date().toISOString().slice(0, 10)

  try {
    // Load the template
    const { data: tpl } = await supabase
      .from('recurring_bookings')
      .select('id, client_id, dog_id, walker_id, walk_type, days_of_week, scheduled_time, duration_minutes, pickup_address, notes, end_date, is_active')
      .eq('id', booking.recurring_template_id)
      .maybeSingle()
    if (!tpl || !(tpl as any).is_active) return 0

    // Count / find last existing occurrence
    const { data: existing } = await supabase
      .from('bookings')
      .select('scheduled_date')
      .eq('recurring_template_id', booking.recurring_template_id)
      .gte('scheduled_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('scheduled_date', { ascending: false })

    const daysPerWeek = Math.max(1, ((tpl as any).days_of_week || []).length)
    const minOccurrencesNeeded = MIN_WEEKS_AHEAD * daysPerWeek
    if ((existing?.length ?? 0) >= minOccurrencesNeeded) return 0 // horizon healthy

    const lastDate = existing?.[0]?.scheduled_date as string | undefined
    const startFromIso = lastDate
      ? new Date(new Date(lastDate + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : today

    const occurrences = expandTemplateOccurrences({
      start_date: startFromIso,
      end_date: (tpl as any).end_date || null,
      days_of_week: (tpl as any).days_of_week,
      weeks_ahead: EXTEND_WEEKS,
    })
    if (occurrences.length === 0) return 0

    const rows = occurrences.map(d => ({
      client_id: (tpl as any).client_id,
      dog_id:    (tpl as any).dog_id,
      walker_id: (tpl as any).walker_id,
      scheduled_date: d,
      scheduled_time: (tpl as any).scheduled_time,
      walk_type: (tpl as any).walk_type,
      duration_minutes: (tpl as any).duration_minutes || 30,
      notes: (tpl as any).notes,
      pickup_address: (tpl as any).pickup_address,
      status: 'pending',
      recurring_template_id: (tpl as any).id,
    }))
    const { error } = await supabase.from('bookings').insert(rows)
    if (error) return 0

    // Ping client + admins so they know the horizon refreshed
    await supabase.from('notifications').insert([{
      user_id: (tpl as any).client_id,
      title: 'Regular walks rolled forward',
      message: `We've added the next ${occurrences.length} walks to your schedule — admin will approve them shortly.`,
      type: 'booking',
      is_read: false,
    }])
    const { data: admins } = await supabase
      .from('profiles').select('id').eq('role', 'admin').eq('is_active', true)
    if (admins && admins.length > 0) {
      await supabase.from('notifications').insert(admins.map((a: any) => ({
        user_id: a.id,
        title: 'Recurring walks auto-extended',
        message: `${occurrences.length} new pending walks added to a client's recurring schedule — ready for bulk approve.`,
        type: 'booking',
        is_read: false,
      })))
    }
    return occurrences.length
  } catch {
    return 0
  }
}
