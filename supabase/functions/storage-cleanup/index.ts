// supabase/functions/storage-cleanup/index.ts
// Monthly job — removes orphaned objects from the `dog-photos` bucket
// that no longer correspond to a pet, walk_log, or profile avatar.
// Schedule via pg_cron, monthly at 04:00 UTC:
//
//   SELECT cron.schedule('monthly-storage-cleanup', '0 4 1 * *',
//     $$ SELECT net.http_post(
--        url:='https://<PROJECT>.functions.supabase.co/storage-cleanup',
--        headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
--      ); $$);
//
// Safe-by-default: if the referenced URL-extraction fails we SKIP (never delete blindly).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'dog-photos'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

function pathFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/object\/public\/dog-photos\/(.+)/) || u.pathname.match(/\/dog-photos\/(.+)/)
    return m ? decodeURIComponent(m[1].split('?')[0]) : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1) Gather every *in-use* path referenced in the DB
  const inUse = new Set<string>()
  const [{ data: dogs }, { data: logs }, { data: profiles }] = await Promise.all([
    supa.from('dogs').select('photo_url').not('photo_url', 'is', null),
    supa.from('walk_logs').select('photo_url').not('photo_url', 'is', null),
    supa.from('profiles').select('avatar_url').not('avatar_url', 'is', null),
  ])
  for (const row of [...(dogs || []), ...(logs || [])]) {
    const p = pathFromUrl((row as any).photo_url); if (p) inUse.add(p)
  }
  for (const row of (profiles || [])) {
    const p = pathFromUrl((row as any).avatar_url); if (p) inUse.add(p)
  }

  // 2) List every object in the bucket (paginate)
  const allObjects: string[] = []
  async function walk(prefix: string) {
    const { data, error } = await supa.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (error) return
    for (const item of (data || [])) {
      if (item.id === null) {
        await walk(prefix ? `${prefix}/${item.name}` : item.name)
      } else {
        allObjects.push(prefix ? `${prefix}/${item.name}` : item.name)
      }
    }
  }
  await walk('')

  // 3) Compute orphans
  const orphans = allObjects.filter(p => !inUse.has(p))

  // 4) Only delete files older than 7 days — safety net against racey uploads
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
  const toDelete: string[] = []
  for (const path of orphans) {
    const { data } = await supa.storage.from(BUCKET).list(path.split('/').slice(0, -1).join('/') || '', { limit: 1, search: path.split('/').pop() })
    const f = data?.[0]
    if (f?.created_at && new Date(f.created_at) < cutoff) toDelete.push(path)
  }

  // 5) Batch-delete (max 1000 per call per Supabase docs)
  let deleted = 0
  for (let i = 0; i < toDelete.length; i += 500) {
    const slice = toDelete.slice(i, i + 500)
    const { error } = await supa.storage.from(BUCKET).remove(slice)
    if (!error) deleted += slice.length
  }

  return new Response(JSON.stringify({
    ok: true,
    inUse: inUse.size,
    bucketTotal: allObjects.length,
    orphans: orphans.length,
    deleted,
    skippedYoung: orphans.length - toDelete.length,
  }), { headers: { 'Content-Type': 'application/json', ...cors } })
})
