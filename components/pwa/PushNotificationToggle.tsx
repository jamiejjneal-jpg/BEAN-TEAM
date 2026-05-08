'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, BellOff } from 'lucide-react'
import { toast } from 'sonner'

// Push notifications — opt-in button.
// Flow:
//   1. User clicks "Enable push notifications"
//   2. Browser permission prompt
//   3. Subscribe to PushManager using a VAPID public key
//   4. Store subscription JSON in `push_subscriptions` table
// Actual sending is done from a Supabase Edge Function (the VAPID private key
// lives there). See /supabase/migrations/20260501_push_subscriptions.sql for
// the table and SUPABASE_EDGE_FUNCTIONS_DEPLOY.md for edge function setup.

// PUBLIC VAPID key (safe in frontend — the private key stays in Supabase secrets).
// Admin generates a VAPID key pair once, pastes the PUBLIC half here or via env.
const VAPID_PUBLIC_KEY =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) || ''

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(ok)
    if (ok) checkSubscribed()
  }, [])

  async function checkSubscribed() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    } catch { /* noop */ }
  }

  async function subscribe() {
    if (!VAPID_PUBLIC_KEY) {
      toast.error('Push notifications not yet set up by the admin (VAPID key missing)')
      return
    }
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { toast.error('Notifications blocked'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const json = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        user_id: user?.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth:   json.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 200),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      setSubscribed(true)
      toast.success('Push notifications enabled')
    } catch (e: any) {
      toast.error(e?.message || 'Could not enable push')
    } finally { setBusy(false) }
  }

  async function unsubscribe() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const supabase = createClient()
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
      toast.success('Push notifications turned off')
    } finally { setBusy(false) }
  }

  if (!supported) return null

  return (
    <button
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={busy}
      className="inline-flex items-center gap-2 text-sm rounded-lg border border-[#E5E3DB] bg-white hover:bg-[#F2F0EB] px-3 py-2 disabled:opacity-50"
      data-testid="push-toggle"
    >
      {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {subscribed ? 'Turn off push' : 'Enable push notifications'}
    </button>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}
