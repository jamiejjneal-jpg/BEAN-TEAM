import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAdminWelcome } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Verify the caller is an authenticated admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, full_name, phone } = body as {
    email?: string; password?: string; full_name?: string; phone?: string
  }

  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'email, password, and full_name are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'admin', phone: phone || '' },
  })

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 })
  }
  if (!created?.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  // Ensure profile row has admin role (trigger creates with metadata, but be defensive)
  await admin.from('profiles').upsert({
    id: created.user.id,
    email,
    full_name,
    role: 'admin',
    phone: phone || '',
  }, { onConflict: 'id' })

  // Generate a one-time password reset link so the new admin can set their own password
  const appUrl = process.env.APP_URL || new URL(request.url).origin
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/reset-password` },
  })
  const resetLink = linkData?.properties?.action_link || `${appUrl}/forgot-password`

  // Fire-and-forget welcome email
  sendAdminWelcome({ to: email, fullName: full_name, resetLink }).catch(() => {})

  return NextResponse.json({ success: true, id: created.user.id })
}
