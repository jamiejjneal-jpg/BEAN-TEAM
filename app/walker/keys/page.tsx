'use client'

// Walker keys view: keys currently in my custody + big "Scan a key" button
// that opens the phone camera.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KeyRound, Camera, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { type Key, fmtDateTime } from '@/lib/keys'

export default function WalkerKeysPage() {
  const supabase = createClient()
  const router = useRouter()
  const [held, setHeld] = useState<Key[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const readerRef = useRef<any>(null)

  useEffect(() => {
    fetchAll()
    return () => { void stopScan() }
    /* eslint-disable-next-line */
  }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('keys')
      .select(`*, client:profiles!keys_client_id_fkey(full_name, email, phone)`)
      .eq('current_holder_id', user.id)
      .order('last_event_at', { ascending: false })
    setHeld((data as Key[]) || [])
    setLoading(false)
  }

  async function startScan() {
    setScanning(true)
    try {
      const mod: any = await import('html5-qrcode')
      const Html5Qrcode = mod.Html5Qrcode
      const reader = new Html5Qrcode('walker-qr-reader')
      readerRef.current = reader
      await reader.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => {
          // Extract /k/<token> from scanned URL
          const m = decodedText.match(/\/k\/([A-Za-z0-9]+)/)
          const token = m ? m[1] : decodedText.trim()
          void stopScan().then(() => router.push(`/k/${token}`))
        },
        () => { /* ignore per-frame decode errors */ }
      )
    } catch (e: any) {
      toast.error('Camera failed: ' + (e?.message || 'unknown'))
      setScanning(false)
    }
  }

  async function stopScan() {
    try {
      const r = readerRef.current
      if (r && r.isScanning) { await r.stop(); r.clear() }
    } catch { /* noop */ }
    readerRef.current = null
    setScanning(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
    </div>
  )

  return (
    <div className="space-y-6" data-testid="walker-keys-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-[#1A4331]" /> Keys
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">
          Scan a client&apos;s key QR to check it in or out. Your name, time and (if allowed) GPS are logged.
        </p>
      </div>

      {/* Scan button / camera */}
      {!scanning ? (
        <Button size="lg" onClick={startScan} className="w-full h-20 text-lg bg-[#2D7A5D] hover:bg-[#1A4331]" data-testid="scan-key-btn">
          <Camera className="h-6 w-6 mr-2" /> Scan a key
        </Button>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-[#1A4331]">Point camera at the QR</p>
              <Button size="sm" variant="outline" onClick={stopScan}><X className="h-4 w-4 mr-1" /> Stop</Button>
            </div>
            <div id="walker-qr-reader" className="w-full max-w-sm mx-auto rounded-xl overflow-hidden" />
          </CardContent>
        </Card>
      )}

      {/* Keys in my custody */}
      <div>
        <h2 className="text-base font-heading font-semibold mt-4 mb-3">In my custody ({held.length})</h2>
        {held.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-[#8A8A8A]">
              You have no keys right now.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {held.map(k => (
              <Link key={k.id} href={`/k/${k.qr_token}`} className="block">
                <Card data-testid={`held-key-${k.qr_token}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[#FDF8EF] text-[#DDA74F] flex items-center justify-center shrink-0">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{k.label}</p>
                      <p className="text-xs text-[#5C5C5C]">{k.client?.full_name || k.client?.email}</p>
                      <p className="text-xs text-[#8A8A8A]">Picked up {fmtDateTime(k.last_event_at)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
