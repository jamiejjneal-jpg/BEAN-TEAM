// Centralised query helpers for "assignable" staff — anyone who can be
// allocated to walks/services. Admins are treated as walkers for the
// purpose of assignment, so any client/admin who wants to assign a walk
// can pick an admin too.
//
// Note: this does NOT change the "Walkers" management page or the payouts
// page — those remain walker-role-only by design.
//
// Use this anywhere you previously filtered profiles by role='walker' for
// the purpose of picking who does a walk.

import type { SupabaseClient } from '@supabase/supabase-js'

// Returns the supabase query filter that includes both walkers and admins.
// Example:
//   const { data } = await assignableProfilesQuery(supabase)
//     .select('id, full_name, walker_profiles(max_dogs)')
//     .order('full_name')
export function assignableRoles(): ('walker' | 'admin')[] {
  return ['walker', 'admin']
}

// Convenience wrapper that returns the filtered builder for active, assignable
// people. Caller adds .select() and any other clauses afterwards.
export function assignableProfilesQuery(supabase: SupabaseClient) {
  return supabase
    .from('profiles')
    .select('*')
    .in('role', assignableRoles())
    .eq('is_active', true)
}
