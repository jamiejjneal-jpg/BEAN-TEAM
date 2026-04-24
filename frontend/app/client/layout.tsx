'use client'

import DashboardLayout from '@/components/shared/DashboardLayout'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="client">{children}</DashboardLayout>
}
