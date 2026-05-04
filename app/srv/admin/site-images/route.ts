import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_IMAGE_SLOTS, type SiteImageKey } from '@/lib/site-images'

export const dynamic = 'force-dynamic'

const VALID_KEYS = new Set<string>(SITE_IMAGE_SLOTS.map(s => s.key))
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('site_images').select('key, url, alt, updated_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ images: data || [] })
}

export async function POST(request: Request) {
  const { error: authErr, user } = await requireAdmin()
  if (authErr) return authErr

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid multipart form' }, { status: 400 })

  const key = String(form.get('key') || '') as SiteImageKey
  const alt = form.get('alt') ? String(form.get('alt')) : null
  const file = form.get('file') as File | null

  if (!VALID_KEYS.has(key)) return NextResponse.json({ error: 'Invalid image key' }, { status: 400 })
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 8 MB)' }, { status: 413 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or GIF allowed' }, { status: 415 })

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${key}/${Date.now()}.${ext || 'jpg'}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from('site-images').upload(path, bytes, {
    contentType: file.type,
    upsert: true,
    cacheControl: '3600',
  })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: pub } = admin.storage.from('site-images').getPublicUrl(path)
  const url = pub.publicUrl

  const { error: dbErr } = await admin.from('site_images').upsert({
    key,
    url,
    alt,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  }, { onConflict: 'key' })
  if (dbErr) return NextResponse.json({ error: `DB write failed: ${dbErr.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, key, url })
}

export async function DELETE(request: Request) {
  const { error: authErr } = await requireAdmin()
  if (authErr) return authErr

  const url = new URL(request.url)
  const key = url.searchParams.get('key') as SiteImageKey | null
  if (!key || !VALID_KEYS.has(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  const admin = createAdminClient()
  const { error: delErr } = await admin.from('site_images').delete().eq('key', key)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
