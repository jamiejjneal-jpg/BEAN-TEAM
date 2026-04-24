'use client'

import { useAuth } from '@/components/auth/AuthProvider'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

// Shared settings shell — used by any authenticated user (admin / walker /
// client). We don't use DashboardLayout here because those are role-specific;
// Settings is a neutral space. Auth is still enforced: the effect bounces
// anyone without a session back to /login.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F9F8F6]">
        <div className="text-center">
          <Loader2 className="h-10 w-10 mx-auto animate-spin text-[#1A4331]" />
          <p className="mt-4 text-sm text-[#8A8A8A]">Loading…</p>
        </div>
      </div>
    )
  }

  return <div className="min-h-screen bg-[#F9F8F6] px-4">{children}</div>
}
