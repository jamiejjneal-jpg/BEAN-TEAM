'use client'

// Client-side fetch of admin-managed services to render at the bottom of
// the pricing page. Silent when no extras are defined — so the hand-crafted
// tiles above aren't duplicated.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageOpen } from 'lucide-react'

type Svc = {
  id: string; value: string; label: string; description: string | null;
  duration_minutes: number; price: number; price_label: string | null;
  category: string | null; show_on_pricing: boolean; is_active: boolean;
}

// Don't re-render these — they're already shown in the beautifully designed tiles above.
const DEFAULT_SEED_VALUES = new Set([
  'walk_30', 'walk_60', 'walk_90', 'group_walk', 'solo_walk',
  'puppy_visit', 'home_visit', 'overnight', 'day_care',
])

export function ExtraServicesSection() {
  const [svcs, setSvcs] = useState<Svc[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('site_services').select('*').eq('is_active', true).eq('show_on_pricing', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        const rows = (data as Svc[] | null) || []
        setSvcs(rows.filter(r => !DEFAULT_SEED_VALUES.has(r.value)))
      })
  }, [])

  if (svcs.length === 0) return null

  // Group by category for a nicer layout when there's >1
  const groups = new Map<string, Svc[]>()
  for (const s of svcs) {
    const key = (s.category || 'Other').trim() || 'Other'
    ;(groups.get(key) || groups.set(key, []).get(key)!).push(s)
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" data-testid="extra-services-section">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#E8F0EC] flex items-center justify-center">
          <PackageOpen className="h-4 w-4 text-[#1A4331]" />
        </div>
        <h3 className="font-heading font-bold text-lg text-[#1A4331]">More services</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        {[...groups.entries()].map(([cat, list]) => (
          <div key={cat} className="bg-white rounded-2xl border border-[#E5E3DB] p-6">
            <p className="text-xs uppercase tracking-wide font-semibold text-[#8A8A8A] mb-3">{cat}</p>
            <ul className="space-y-2">
              {list.map(s => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg bg-[#F9F8F6] border border-[#F2F0EB]" data-testid={`pricing-svc-${s.value}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A]">{s.label}</p>
                    {s.description && <p className="text-xs text-[#8A8A8A] mt-0.5 leading-relaxed">{s.description}</p>}
                  </div>
                  <span className="font-heading font-bold text-lg text-[#1A4331] shrink-0">
                    {s.price_label || `£${Number(s.price).toFixed(2)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
