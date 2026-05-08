'use client'

// Public key scan page.
// - Unauthed / unknown: shows "Please return this key" card with contact info
// - Client (own key): shows key info + current holder
// - Walker / Admin: shows key info + "Take custody" / "Return to safe" buttons
//   with optional GPS stamp.

import { useEffect, useState, use as unwrap } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KeyRound, MapPin, Loader2, ArrowRight, Home } from 'lucide-react'
import { toast } from 'sonner'
import { type Key, type KeyEvent, fmtDateTime, statusTone } from '@/lib/keys'
import { enqueue } from '@/lib/pwa/offline-queue'

type Mode = 'loading' | 'public' | 'client_view' | 'authed_full'

export default function KeyScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = unwrap(params)
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('loading')
  const [publicInfo, setPublicInfo] = useState<{ label: string; status: string; client_name: string | null; client_phone: string | null; business_name: string | null } | null>(null)
  const [key, setKey] = useState<Key | null>(null)
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { init() /* eslint-disable-next-line */ }, [token])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return loadPublic()

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const myRole = (me as any)?.role as string | undefined
    setRole(myRole || null)

    if (!myRole) return loadPublic()

    // Try to load the full key via RLS (admin sees all, client/walker see their own / held)
    const { data: k } = await supabase.from('keys')
      .select(`*,
        client:profiles!keys_client_id_fkey(full_name, email, phone),
        current_holder:profiles!keys_current_holder_id_fkey(full_name, role)`)
      .eq('qr_token', token).maybeSingle()

    if (!k) {
      // authed but RLS hides it (e.g. walker looking at unfamiliar client's key)
      // Fall back to public "please return" view.
      return loadPublic()
    }

    setKey(k as Key)
    const { data: evs } = await supabase.from('key_events').select('*').eq('key_id', (k as any).id).order('created_at', { ascending: false }).limit(50)
    setEvents((evs as KeyEvent[]) || [])

    if (myRole === 'client') setMode('client_view')
    else setMode('authed_full') // admin or walker

    // Log a "viewed" event (fire-and-forget)
    try {
      await supabase.rpc('record_key_event', {
        p_key_id: (k as any).id, p_event_type: 'viewed',
        p_note: null, p_geo_lat: null, p_geo_lng: null,
        p_user_agent: navigator.userAgent.slice(0, 200),
      })
    } catch { /* best-effort */ }
  }

  async function loadPublic() {
    const { data } = await supabase.rpc('lookup_key_by_token', { p_token: token })
    const row = Array.isArray(data) ? data[0] : data
    if (row) setPublicInfo(row as any)
    setMode('public')
  }

  async function handover(ev: 'pickup' | 'dropoff') {
    if (!key) return
    setBusy(true)
    // Optional GPS (best-effort, 3 second timeout)
    let lat: number | null = null, lng: number | null = null
    await new Promise<void>(resolve => {
      if (!navigator.geolocation) return resolve()
      const t = setTimeout(() => resolve(), 3000)
      navigator.geolocation.getCurrentPosition(
        p => { lat = p.coords.latitude; lng = p.coords.longitude; clearTimeout(t); resolve() },
        () => { clearTimeout(t); resolve() },
        { enableHighAccuracy: false, timeout: 2800 }
      )
    })

    const { error } = await supabase.rpc('record_key_event', {
      p_key_id: key.id, p_event_type: ev,
      p_note: null, p_geo_lat: lat, p_geo_lng: lng,
      p_user_agent: navigator.userAgent.slice(0, 200),
    })
    setBusy(false)

    // Offline fallback: queue it and fake success locally.
    if (error && (!navigator.onLine || /network|fetch|failed/i.test(error.message || ''))) {
      await enqueue({
        kind: 'key_event',
        key_id: key.id,
        event_type: ev,
        geo_lat: lat, geo_lng: lng,
        user_agent: navigator.userAgent.slice(0, 200),
        when: new Date().toISOString(),
      })
      toast.success(ev === 'pickup' ? 'Pickup queued — will sync when online' : 'Dropoff queued — will sync when online')
      return
    }
    if (error) { toast.error(error.message); return }
    toast.success(ev === 'pickup' ? 'Key picked up — logged' : 'Key returned — logged')
    init()
  }

  // ---------- Rendering ----------
  if (mode === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
    </div>
  )

  // PUBLIC (unauthed or unauthorised): "Please return" card
  if (mode === 'public') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F9F8F6] to-[#E8F0EC] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center mx-auto">
              <KeyRound className="h-8 w-8" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-[#1A4331]">You&apos;ve found a lost key</h1>
            <p className="text-[#5C5C5C] text-sm">
              This key belongs to a client of {publicInfo?.business_name || "Rocky's Retreat and Rambles"}. Please help us return it.
            </p>
            {publicInfo && (
              <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-xl p-4 text-left text-sm">
                <p className="text-[#8A8A8A] text-xs uppercase tracking-wide mb-1">Key label</p>
                <p className="font-medium">{publicInfo.label}</p>
              </div>
            )}
            <div className="bg-[#1A4331] text-white rounded-xl p-5 space-y-2">
              <p className="text-xs uppercase tracking-wide opacity-70">Please contact us</p>
              <p className="font-heading text-lg">{publicInfo?.business_name || "Rocky's Retreat and Rambles"}</p>
              <Link href="/" className="inline-flex items-center gap-2 text-sm underline opacity-90 hover:opacity-100">
                Contact details on our site <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-xs text-[#8A8A8A]">
              Thank you for being honest. The owner will be very grateful.
            </p>
            <Link href="/"><Button variant="outline" className="w-full"><Home className="h-4 w-4 mr-1" /> Home page</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // CLIENT (own key): show history, no action buttons
  if (mode === 'client_view' && key) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-heading text-xl font-bold">{key.label}</p>
                  <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusTone(key.status)} mt-0.5`}>
                    {key.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="pt-3 border-t border-[#F2F0EB]">
                <p className="text-xs uppercase tracking-wide text-[#8A8A8A]">Currently with</p>
                <p className="font-medium mt-0.5">
                  {key.current_holder_id
                    ? <>{key.current_holder?.full_name} <span className="text-xs text-[#8A8A8A] capitalize">({key.current_holder_role})</span></>
                    : <span className="text-[#1A4331]">In our safe</span>}
                </p>
                <p className="text-xs text-[#8A8A8A] mt-0.5">Since {fmtDateTime(key.last_event_at)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="font-heading text-lg font-semibold mb-3">History</p>
              <div className="space-y-2">
                {events.length === 0 && <p className="text-sm text-[#8A8A8A]">No events yet.</p>}
                {events.map(e => (
                  <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border border-[#F2F0EB]">
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#F2F0EB] text-[#5C5C5C] shrink-0">
                      {e.event_type}
                    </span>
                    <div className="flex-1 min-w-0 text-sm">
                      <p>{e.actor_name} <span className="text-[#8A8A8A] text-xs capitalize">({e.actor_role})</span></p>
                      <p className="text-xs text-[#8A8A8A]">{fmtDateTime(e.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Link href="/client/keys"><Button variant="outline" className="w-full"><KeyRound className="h-4 w-4 mr-1" /> All my keys</Button></Link>
        </div>
      </div>
    )
  }

  // ADMIN or WALKER: full view + action buttons
  if (mode === 'authed_full' && key) {
    const me = role
    const iAmHolder = !!key.current_holder_id // (we already logged 'viewed'; check the joined profile later)
    return (
      <div className="min-h-screen bg-[#F9F8F6] p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center">
                  <KeyRound className="h-7 w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-2xl font-bold">{key.label}</p>
                  <p className="text-sm text-[#5C5C5C]">{key.client?.full_name || key.client?.email}</p>
                  <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusTone(key.status)} mt-1`}>
                    {key.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#F2F0EB]">
                <p className="text-xs uppercase tracking-wide text-[#8A8A8A]">Currently with</p>
                <p className="font-medium">
                  {key.current_holder_id
                    ? <>{key.current_holder?.full_name} <span className="text-xs text-[#8A8A8A] capitalize">({key.current_holder_role})</span></>
                    : <span className="text-[#1A4331]">In safe</span>}
                </p>
                <p className="text-xs text-[#8A8A8A]">Last event {fmtDateTime(key.last_event_at)}</p>
              </div>

              {/* Actions — only if key is active */}
              {key.status === 'active' && (
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#F2F0EB]">
                  <Button
                    size="lg"
                    onClick={() => handover('pickup')}
                    disabled={busy}
                    className="bg-[#2D7A5D] hover:bg-[#1A4331]"
                    data-testid="scan-pickup"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'I have the key'}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => handover('dropoff')}
                    disabled={busy}
                    data-testid="scan-dropoff"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Returned to safe'}
                  </Button>
                </div>
              )}
              {key.status !== 'active' && (
                <p className="pt-3 border-t border-[#F2F0EB] text-xs text-[#E06D53] text-center">
                  This key is {key.status}. No handovers can be logged. Ask an admin to reactivate if needed.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="font-heading text-lg font-semibold mb-3">Recent events ({events.length})</p>
              <div className="space-y-2">
                {events.length === 0 && <p className="text-sm text-[#8A8A8A]">No events yet.</p>}
                {events.slice(0, 20).map(e => (
                  <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border border-[#F2F0EB]">
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#F2F0EB] text-[#5C5C5C] shrink-0">
                      {e.event_type}
                    </span>
                    <div className="flex-1 min-w-0 text-sm">
                      <p>{e.actor_name} <span className="text-[#8A8A8A] text-xs capitalize">({e.actor_role})</span></p>
                      <p className="text-xs text-[#8A8A8A] flex items-center gap-3">
                        <span>{fmtDateTime(e.created_at)}</span>
                        {e.geo_lat != null && e.geo_lng != null && (
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />GPS logged</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {me === 'admin' && (
            <Link href={`/admin/keys/${key.id}`}>
              <Button variant="outline" className="w-full">Full admin view</Button>
            </Link>
          )}
          {me === 'walker' && (
            <Link href="/walker/keys"><Button variant="outline" className="w-full">My keys</Button></Link>
          )}
        </div>
      </div>
    )
  }

  return null
}
