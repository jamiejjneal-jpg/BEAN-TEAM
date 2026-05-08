'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Bell } from 'lucide-react'
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle'

// Drop-in card that surfaces the push notification opt-in on a profile page.
// Hides itself on browsers that don't support push (handled inside the toggle).
export default function PushSettingsCard() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-semibold">Push notifications</p>
            <p className="text-xs text-[#5C5C5C] mt-0.5">
              Get an instant notification when bookings are approved, walks start, or keys move — even with the app closed.
            </p>
          </div>
        </div>
        <PushNotificationToggle />
      </CardContent>
    </Card>
  )
}
