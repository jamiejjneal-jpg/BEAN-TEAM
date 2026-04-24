import { createClient } from '@/lib/supabase/client'

export type Role = 'admin' | 'walker' | 'client'

async function invoke(body: Record<string, unknown>) {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('admin-ops', { body })
  if (error) throw new Error(error.message || 'Request failed')
  if (data?.error) throw new Error(data.error)
  return data
}

export function createAdminAccount(input: { email: string; password: string; full_name: string; phone?: string }) {
  return invoke({ op: 'create_admin', ...input })
}

export function changeUserRole(user_id: string, new_role: Role) {
  return invoke({ op: 'change_role', user_id, new_role })
}

export function deleteUser(user_id: string) {
  return invoke({ op: 'delete_user', user_id })
}
