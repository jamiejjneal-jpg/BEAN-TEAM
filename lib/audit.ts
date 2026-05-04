import { createClient } from '@/lib/supabase/client'

// Browser-side audit logger. Admin-RLS allows insert when the caller is an admin.
// Fire-and-forget: logging must never block the user's action.
export async function logAudit(entry: {
  action: string
  target_type?: string
  target_id?: string
  target_name?: string
  details?: Record<string, unknown>
}) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: me } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      actor_name: me?.full_name || null,
      actor_email: me?.email || user.email || null,
      action: entry.action,
      target_type: entry.target_type || null,
      target_id: entry.target_id || null,
      target_name: entry.target_name || null,
      details: entry.details || null,
    })
  } catch (e) {
    console.warn('[audit] log failed', e)
  }
}
