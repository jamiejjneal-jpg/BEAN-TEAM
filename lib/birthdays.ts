// Birthday detection helpers — pure date logic, easy to test.
import type { SupabaseClient } from '@supabase/supabase-js'

export type DogWithBirthday = {
  id: string
  name: string
  date_of_birth: string | null
  client_id: string
  client_name?: string | null
  client_email?: string | null
  age_today?: number
  days_until?: number
}

// 0 = today, 1 = tomorrow, etc. Returns null if no DOB.
export function daysUntilBirthday(dobIso: string | null, today = new Date()): number | null {
  if (!dobIso) return null
  const dob = new Date(dobIso)
  if (Number.isNaN(dob.getTime())) return null
  const m = dob.getUTCMonth()
  const d = dob.getUTCDate()
  const t = new Date(today)
  let next = new Date(Date.UTC(t.getUTCFullYear(), m, d))
  if (next < new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()))) {
    next = new Date(Date.UTC(t.getUTCFullYear() + 1, m, d))
  }
  const ms = next.getTime() - new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())).getTime()
  return Math.round(ms / 86400000)
}

export function ageOnNextBirthday(dobIso: string | null, today = new Date()): number | null {
  if (!dobIso) return null
  const dob = new Date(dobIso)
  if (Number.isNaN(dob.getTime())) return null
  const t = new Date(today)
  const yearsBefore = t.getUTCFullYear() - dob.getUTCFullYear()
  const turnedThisYear =
    t.getUTCMonth() > dob.getUTCMonth() ||
    (t.getUTCMonth() === dob.getUTCMonth() && t.getUTCDate() >= dob.getUTCDate())
  return turnedThisYear ? yearsBefore + 1 : yearsBefore
}

export async function fetchUpcomingDogBirthdays(
  supabase: SupabaseClient,
  opts: { withinDays?: number; ownerId?: string | null } = {},
): Promise<DogWithBirthday[]> {
  const within = opts.withinDays ?? 7
  let q = supabase
    .from('dogs')
    .select('id, name, date_of_birth, client_id:owner_id, client:profiles!dogs_owner_id_fkey(full_name, email)')
    .not('date_of_birth', 'is', null)
  if (opts.ownerId) q = q.eq('owner_id', opts.ownerId)

  const { data } = await q
  const rows = (data as any[]) || []
  const result: DogWithBirthday[] = []
  for (const r of rows) {
    const days = daysUntilBirthday(r.date_of_birth)
    if (days == null || days > within) continue
    result.push({
      id: r.id,
      name: r.name,
      date_of_birth: r.date_of_birth,
      client_id: r.client_id,
      client_name: r.client?.full_name || null,
      client_email: r.client?.email || null,
      age_today: ageOnNextBirthday(r.date_of_birth) ?? undefined,
      days_until: days,
    })
  }
  result.sort((a, b) => (a.days_until! - b.days_until!))
  return result
}
