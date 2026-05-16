'use client'

// Birthday banner — appears on dashboards when one or more dogs have a
// birthday in the next 7 days (or today). Compact, dismissible per day.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Cake } from 'lucide-react'
import { fetchUpcomingDogBirthdays, type DogWithBirthday } from '@/lib/birthdays'

export default function BirthdayBanner({ ownerId }: { ownerId?: string }) {
  const [dogs, setDogs] = useState<DogWithBirthday[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const key = `rockys:bd-dismissed:${today}`
    if (typeof window !== 'undefined' && localStorage.getItem(key)) {
      setDismissed(true); return
    }
    fetchUpcomingDogBirthdays(supabase, { withinDays: 7, ownerId }).then(setDogs)
  }, [ownerId])

  if (dismissed || dogs.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)
  const todays = dogs.filter(d => d.days_until === 0)
  const upcoming = dogs.filter(d => (d.days_until || 0) > 0)

  function dismiss() {
    try { localStorage.setItem(`rockys:bd-dismissed:${today}`, '1') } catch {}
    setDismissed(true)
  }

  return (
    <div className="mb-6 rounded-xl border border-[#DDA74F]/40 bg-gradient-to-r from-[#FDF8EF] to-[#FAF1DC] p-4 flex items-start gap-3" data-testid="birthday-banner">
      <div className="h-10 w-10 rounded-full bg-[#DDA74F] text-white flex items-center justify-center shrink-0">
        <Cake className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        {todays.length > 0 && (
          <p className="font-heading font-bold text-[#1A4331] text-base">
            🎂 Happy birthday {todays.map(d => `${d.name}${d.age_today ? ` (${d.age_today}!)` : ''}`).join(', ')}!
          </p>
        )}
        {upcoming.length > 0 && (
          <p className="text-sm text-[#5C5C5C] mt-0.5">
            Coming up:{' '}
            {upcoming.slice(0, 3).map((d, i) => (
              <span key={d.id}>
                <strong>{d.name}</strong>{' '}
                <span className="text-xs">turns {d.age_today} in {d.days_until} day{d.days_until === 1 ? '' : 's'}</span>
                {i < Math.min(upcoming.length, 3) - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>
      <button onClick={dismiss} className="text-xs text-[#5C5C5C] hover:text-[#1A1A1A] underline shrink-0 mt-1">Dismiss</button>
    </div>
  )
}
