// Hook + helpers that load services from public.site_services at runtime.
// Falls back to the hard-coded WALK_TYPES so the app never breaks when the
// table hasn't been seeded yet (e.g. on first deploy).

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WALK_TYPES } from '@/lib/utils'

export type SiteService = {
  id?: string
  value: string
  label: string
  description?: string | null
  duration_minutes: number
  price: number
  price_label?: string | null
  client_bookable: boolean
  show_on_pricing: boolean
  category?: string | null
  sort_order: number
  is_active: boolean
}

function fallback(): SiteService[] {
  return WALK_TYPES.map((w: any, i: number) => ({
    value: w.value,
    label: w.label,
    description: null,
    duration_minutes: w.duration || 30,
    price: Number((w.label.match(/£(\d+(?:\.\d{1,2})?)/) || [])[1] || 0),
    price_label: null,
    client_bookable: w.clientBookable !== false,
    show_on_pricing: true,
    category: 'Walks',
    sort_order: (i + 1) * 10,
    is_active: true,
  }))
}

export function useSiteServices(opts?: { clientBookableOnly?: boolean; forPricing?: boolean }) {
  const [services, setServices] = useState<SiteService[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('site_services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error || !data || data.length === 0) {
        setServices(fallback())
      } else {
        setServices((data as SiteService[]))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = (services || fallback()).filter(s => {
    if (opts?.clientBookableOnly && !s.client_bookable) return false
    if (opts?.forPricing && !s.show_on_pricing) return false
    return true
  })

  return { services: filtered, loading }
}

export function priceOfService(value: string, services: SiteService[]): number {
  return services.find(s => s.value === value)?.price ?? 0
}
