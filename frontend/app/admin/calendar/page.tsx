'use client'
import { useAuth } from '@/components/auth/AuthProvider'
import { WeeklyCalendar } from '@/components/shared/WeeklyCalendar'
import { WorkloadHeatmap } from '@/components/shared/WorkloadHeatmap'

export default function AdminCalendarPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="space-y-6">
      <WorkloadHeatmap />
      <WeeklyCalendar
        variant="admin"
        userId={user.id}
        title="Weekly Walks Calendar"
        subtitle="All bookings Mon → Sun — filter by category, print A4 landscape, red outline shows walker schedule conflicts."
      />
    </div>
  )
}
