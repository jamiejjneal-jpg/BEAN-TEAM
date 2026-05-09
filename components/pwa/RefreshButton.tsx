'use client'

// Floating refresh button — appears when the app is launched as a standalone
// PWA (installed on home screen) OR on small screens. iOS Safari has no
// pull-to-refresh in standalone mode, so this is the user's escape hatch.
//
// Tap = soft refresh (location.reload).
// Long press (2s) = deep refresh — clears service-worker caches & reloads.
// While long-pressing, an arc fills around the icon to give visual feedback.

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const LONG_PRESS_MS = 2000

export default function RefreshButton() {
  const [show, setShow] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [busy, setBusy] = useState(false)
  const startTime = useRef<number>(0)
  const rafId = useRef<number | null>(null)
  const longPressFired = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => {
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true
      const smallScreen = window.matchMedia?.('(max-width: 768px)').matches
      setShow(isStandalone || smallScreen)
    }
    update()
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener?.('change', update)
    window.addEventListener('resize', update)
    return () => {
      mq.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  function startPress() {
    if (busy) return
    longPressFired.current = false
    setPressing(true)
    startTime.current = Date.now()
    setProgress(0)
    const tick = () => {
      const elapsed = Date.now() - startTime.current
      const p = Math.min(1, elapsed / LONG_PRESS_MS)
      setProgress(p)
      if (p >= 1 && !longPressFired.current) {
        longPressFired.current = true
        deepRefresh()
        return
      }
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
  }

  function endPress() {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    const elapsed = Date.now() - startTime.current
    setPressing(false)
    setProgress(0)
    // Soft refresh on quick tap (only if long press didn't fire)
    if (!longPressFired.current && elapsed < LONG_PRESS_MS && elapsed > 30) {
      softRefresh()
    }
  }

  function softRefresh() {
    setBusy(true)
    // Reload current URL (Next.js router cache + HTTP cache bypass)
    window.location.reload()
  }

  async function deepRefresh() {
    setBusy(true)
    toast('Clearing app cache & reloading…')
    try {
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(n => caches.delete(n)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
    } catch { /* best-effort */ }
    // Add a cache-busting query so the next nav skips intermediate caches
    const u = new URL(window.location.href)
    u.searchParams.set('_r', Date.now().toString())
    window.location.replace(u.toString())
  }

  if (!show) return null

  const sz = 48
  const r = 22
  const c = 2 * Math.PI * r

  return (
    <button
      type="button"
      aria-label="Refresh"
      data-testid="pwa-refresh-button"
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={e => e.preventDefault()}
      className="fixed z-40 bottom-20 right-4 sm:bottom-4 sm:right-4 h-12 w-12 rounded-full bg-white border border-[#E5E3DB] shadow-lg flex items-center justify-center text-[#1A4331] active:scale-95 transition-transform select-none"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Long-press progress ring */}
      <svg className="absolute inset-0 -rotate-90" width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} aria-hidden="true">
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="transparent" />
        <circle
          cx={sz/2} cy={sz/2} r={r}
          fill="none"
          stroke="#1A4331"
          strokeWidth={pressing ? 3 : 0}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: pressing ? 'none' : 'stroke-dashoffset 200ms' }}
        />
      </svg>
      {busy
        ? <Loader2 className="h-5 w-5 animate-spin" />
        : <RefreshCw className={`h-5 w-5 ${pressing ? 'rotate-45 transition-transform duration-150' : ''}`} />
      }
    </button>
  )
}
