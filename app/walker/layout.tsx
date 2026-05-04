'use client'

import DashboardLayout from '@/components/shared/DashboardLayout'

export default function WalkerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="walker">{children}</DashboardLayout>
}
