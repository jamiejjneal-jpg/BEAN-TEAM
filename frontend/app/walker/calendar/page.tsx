'use client'
import { useAuth } from '@/components/auth/AuthProvider'
import { WeeklyCalendar } from '@/components/shared/WeeklyCalendar'

export default function WalkerCalendarPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <WeeklyCalendar
      variant="walker"
      userId={user.id}
      title="My Weekly Calendar"
      subtitle="Your confirmed walks Mon → Sun. Print a copy to keep in the van, or tap a chip to focus on a single type."
    />
  )
}
