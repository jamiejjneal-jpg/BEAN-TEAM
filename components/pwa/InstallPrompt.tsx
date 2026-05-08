'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

// Install prompt banner — appears after the browser fires `beforeinstallprompt`.
// iOS Safari doesn't fire that event, so we show a gentler "Add to home screen"
// hint on iOS once per device.

const DISMISS_KEY = 'rockys:install-dismissed-v1'

type Deferred = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<Deferred>(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(DISMISS_KEY)) return

    // Already installed? Standalone mode detection
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    if (isStandalone) return

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    if (isIOS) {
      // Show gentle hint after a short delay
      const t = setTimeout(() => setIosHint(true), 4000)
      return () => clearTimeout(t)
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as any)
      // Defer the prompt a touch so it doesn't slam the user on first load
      setTimeout(() => setShow(true), 2500)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setShow(false); setIosHint(false); setDeferred(null)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    dismiss()
  }

  if (iosHint) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-50 max-w-md mx-auto bg-white border border-[#E5E3DB] rounded-xl shadow-xl p-4 text-sm" data-testid="ios-install-hint">
        <button onClick={dismiss} aria-label="Dismiss" className="absolute top-2 right-2 text-[#8A8A8A] hover:text-[#1A1A1A]"><X className="h-4 w-4" /></button>
        <p className="font-heading font-semibold text-[#1A4331] pr-5 mb-1">Install Rocky&apos;s on your iPhone</p>
        <p className="text-[#5C5C5C] text-xs leading-snug">Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> — the app will open fullscreen and work even without a signal.</p>
      </div>
    )
  }

  if (!show || !deferred) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 max-w-md mx-auto bg-white border border-[#E5E3DB] rounded-xl shadow-xl p-4 flex items-center gap-3" data-testid="install-prompt">
      <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center shrink-0">
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-[#1A1A1A] text-sm">Install Rocky&apos;s</p>
        <p className="text-xs text-[#5C5C5C]">One-tap shortcut · works offline</p>
      </div>
      <button onClick={install} className="bg-[#1A4331] text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#265C45]" data-testid="install-accept">Install</button>
      <button onClick={dismiss} aria-label="Dismiss" className="text-[#8A8A8A] hover:text-[#1A1A1A]"><X className="h-4 w-4" /></button>
    </div>
  )
}
