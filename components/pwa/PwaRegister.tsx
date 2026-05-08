'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { drainQueue, getAll } from '@/lib/pwa/offline-queue'
import { toast } from 'sonner'

// Client-side PWA orchestration:
// - Register the service worker
// - Listen for online/offline events
// - On "online" (or SW postMessage), drain the offline queue
// - Render nothing visible; just wires things up.
export default function PwaRegister() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Register SW
    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        setReady(true)
      } catch (e) {
        console.warn('[pwa] SW registration failed', e)
      }
    }
    register()

    const supabase = createClient()
    let draining = false
    const tryDrain = async () => {
      if (draining) return
      draining = true
      try {
        const entries = await getAll()
        if (entries.length === 0) return
        const { ok, fail } = await drainQueue(supabase)
        if (ok > 0) toast.success(`${ok} queued action${ok === 1 ? '' : 's'} synced`)
        if (fail > 0 && ok === 0) toast.warning(`${fail} action${fail === 1 ? '' : 's'} still waiting to sync`)
      } finally { draining = false }
    }

    // Drain on startup + whenever the browser flips back online
    const onOnline = () => { tryDrain() }
    window.addEventListener('online', onOnline)
    navigator.serviceWorker.addEventListener('message', (e: any) => {
      if (e?.data?.type === 'rockys:drain-queue') tryDrain()
    })

    // Kick once on mount in case there's a backlog
    tryDrain()

    return () => { window.removeEventListener('online', onOnline) }
  }, [])

  return null
}
