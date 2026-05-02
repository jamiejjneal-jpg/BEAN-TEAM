'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Legacy route — keep working links by redirecting to the new unified page.
export default function SiteImagesLegacyRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/site-setup') }, [router])
  return <div className="flex items-center justify-center py-20 text-sm text-[#8A8A8A]">Redirecting to Site Setup…</div>
}
