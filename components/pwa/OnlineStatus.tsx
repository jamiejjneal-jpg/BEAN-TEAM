'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

// Thin top-of-page banner that only shows when offline.
export default function OnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null
  return (
    <div
      className="sticky top-0 z-50 bg-[#DDA74F] text-white text-xs sm:text-sm font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-sm"
      data-testid="offline-banner"
    >
      <WifiOff className="h-4 w-4" />
      <span>You&apos;re offline. Actions will be saved and synced when you&apos;re back online.</span>
    </div>
  )
}
