'use client'
import { useAuth } from '@/components/auth/AuthProvider'
import { WeeklyCalendar } from '@/components/shared/WeeklyCalendar'

export default function AdminCalendarPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <WeeklyCalendar
      variant="admin"
      userId={user.id}
      title="Weekly Walks Calendar"
      subtitle="All bookings Mon → Sun — filter by category, print A4 landscape, red outline shows walker schedule conflicts."
    />
  )
}
