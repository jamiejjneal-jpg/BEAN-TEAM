'use client'
import { useAuth } from '@/components/auth/AuthProvider'
import { WeeklyCalendar } from '@/components/shared/WeeklyCalendar'

export default function ClientCalendarPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <WeeklyCalendar
      variant="client"
      userId={user.id}
      title="Your Dog's Week"
      subtitle="Your upcoming walks and visits Mon → Sun. Print to stick on the fridge — handy for dog-sitters too."
    />
  )
}
