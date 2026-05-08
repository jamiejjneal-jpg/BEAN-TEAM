import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Bulk-creates client accounts. Caller must be admin.
//
// POST /srv/admin/clients/bulk-import
// body: { rows: Array<{ email, full_name, phone?, address?, emergency_contact?, emergency_phone?, key_code?, notes? }>, send_invite: boolean }
//
// Each row creates:
//   1. an auth user (random password, email_confirm = true)
//   2. a `profiles` row with role='client'
//   3. (optional) a magic-link invite email for the client to set a password
//
// Returns per-row results so the UI can highlight failures.

export const dynamic = 'force-dynamic'

type Row = {
  email: string
  full_name?: string
  phone?: string
  address?: string
  emergency_contact?: string
  emergency_phone?: string
  key_code?: string
  notes?: string
}

export async function POST(request: Request) {
  // 1) Auth — admin only
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((me as any)?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // 2) Parse body
  let body: { rows: Row[]; send_invite?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }) }
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'no_rows' }, { status: 400 })
  }
  if (body.rows.length > 500) {
    return NextResponse.json({ error: 'too_many', message: 'Max 500 clients per import' }, { status: 400 })
  }

  const admin = createAdminClient()
  const results: Array<{ row: number; email: string; status: 'created' | 'exists' | 'error'; error?: string; user_id?: string }> = []

  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i]
    const email = (r.email || '').trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      results.push({ row: i + 1, email, status: 'error', error: 'invalid email' })
      continue
    }

    try {
      // Create auth user (idempotent — if it already exists we'll catch and skip)
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: cryptoRandomPassword(),
        user_metadata: { full_name: r.full_name || '' },
      })

      let userId: string | null = null
      if (cErr) {
        // Probably already exists — look it up
        const existing = await admin.auth.admin.listUsers()
        const found = existing.data?.users?.find(u => (u.email || '').toLowerCase() === email)
        if (!found) {
          results.push({ row: i + 1, email, status: 'error', error: cErr.message })
          continue
        }
        userId = found.id
        results.push({ row: i + 1, email, status: 'exists', user_id: userId })
      } else {
        userId = created!.user!.id
        results.push({ row: i + 1, email, status: 'created', user_id: userId })
      }

      // Upsert profile row
      await admin.from('profiles').upsert({
        id: userId,
        email,
        role: 'client',
        full_name: r.full_name?.trim() || null,
        phone: r.phone?.trim() || null,
        address: r.address?.trim() || null,
        emergency_contact: r.emergency_contact?.trim() || null,
        emergency_phone: r.emergency_phone?.trim() || null,
        key_code: r.key_code?.trim() || null,
        notes: r.notes?.trim() || null,
        is_active: true,
      }, { onConflict: 'id' })

      // Optional invite email so they can set their own password
      if (body.send_invite) {
        try { await admin.auth.admin.inviteUserByEmail(email) } catch { /* best-effort */ }
      }
    } catch (e: any) {
      results.push({ row: i + 1, email, status: 'error', error: e?.message || 'unknown' })
    }
  }

  const summary = {
    total: results.length,
    created: results.filter(r => r.status === 'created').length,
    existed: results.filter(r => r.status === 'exists').length,
    failed:  results.filter(r => r.status === 'error').length,
  }
  return NextResponse.json({ summary, results })
}

function cryptoRandomPassword(): string {
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('') + 'A1!'
}
