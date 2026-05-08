// IndexedDB-backed offline queue for mutations that failed while offline.
// Each entry is a self-describing record replayed by `drainQueue()` via the
// live Supabase client once connectivity returns.

export type QueuedOp =
  | { kind: 'booking_status'; booking_id: string; status: string; when: string }
  | { kind: 'key_event'; key_id: string; event_type: 'pickup' | 'dropoff'; note?: string | null; geo_lat?: number | null; geo_lng?: number | null; user_agent?: string | null; when: string }
  | { kind: 'walk_log_photo'; booking_id: string | null; dog_id: string | null; walker_id: string | null; photo_data_url: string; caption: string; when: string }

type QueueEntry = { id?: number; op: QueuedOp; created_at: number; attempts: number }

const DB_NAME = 'rockys-offline'
const STORE = 'queue'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(op: QueuedOp): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add({ op, created_at: Date.now(), attempts: 0 } satisfies QueueEntry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()

  // Best-effort Background Sync registration (nudge SW later)
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg && 'sync' in reg) {
      // @ts-ignore — Background Sync not in every TS lib
      await reg.sync.register('rockys-queue')
    }
  } catch { /* noop */ }
}

export async function getAll(): Promise<QueueEntry[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await openDb()
  const result = await new Promise<QueueEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as QueueEntry[]) || [])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

export async function remove(id: number): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function updateAttempts(id: number, attempts: number): Promise<void> {
  const db = await openDb()
  const entry = await new Promise<QueueEntry | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result as QueueEntry | undefined)
    req.onerror = () => reject(req.error)
  })
  if (entry) {
    entry.attempts = attempts
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  db.close()
}

// Drain routine — replays queued ops using the passed-in Supabase client.
// Returns { ok, fail } counts.
export async function drainQueue(supabase: any): Promise<{ ok: number; fail: number }> {
  const entries = await getAll()
  let ok = 0, fail = 0
  for (const e of entries) {
    try {
      const success = await replay(supabase, e.op)
      if (success) { await remove(e.id!); ok++ }
      else {
        if ((e.attempts ?? 0) > 5) await remove(e.id!) // give up after 6 tries
        else await updateAttempts(e.id!, (e.attempts ?? 0) + 1)
        fail++
      }
    } catch {
      fail++
      if ((e.attempts ?? 0) > 5) await remove(e.id!)
      else await updateAttempts(e.id!, (e.attempts ?? 0) + 1)
    }
  }
  return { ok, fail }
}

async function replay(supabase: any, op: QueuedOp): Promise<boolean> {
  if (op.kind === 'booking_status') {
    const { error } = await supabase.from('bookings').update({ status: op.status }).eq('id', op.booking_id)
    return !error
  }
  if (op.kind === 'key_event') {
    const { error } = await supabase.rpc('record_key_event', {
      p_key_id: op.key_id,
      p_event_type: op.event_type,
      p_note: op.note ?? null,
      p_geo_lat: op.geo_lat ?? null,
      p_geo_lng: op.geo_lng ?? null,
      p_user_agent: op.user_agent ?? null,
    })
    return !error
  }
  if (op.kind === 'walk_log_photo') {
    // Convert data URL → Blob, upload, insert walk_log
    const blob = dataUrlToBlob(op.photo_data_url)
    const ext = blob.type.split('/')[1] || 'jpg'
    const path = `${op.booking_id ? `walks/${op.booking_id}` : `dogs/${op.dog_id || 'adhoc'}`}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('dog-photos').upload(path, blob, { upsert: true })
    if (upErr) return false
    const { data } = supabase.storage.from('dog-photos').getPublicUrl(path)
    const photoUrl = `${data.publicUrl}?t=${Date.now()}`
    const { error: insErr } = await supabase.from('walk_logs').insert({
      booking_id: op.booking_id,
      dog_id: op.dog_id,
      walker_id: op.walker_id,
      photo_url: photoUrl,
      caption: op.caption || '',
      event_type: 'photo',
    })
    return !insErr
  }
  return false
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg'
  const binary = atob(body)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
