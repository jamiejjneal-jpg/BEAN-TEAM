'use client'

// Renders an admin-editable text block. Fetches `public.site_texts` once
// with a module-level cache. The cache auto-expires after 5 minutes so
// edits made in another tab/device propagate without a hard reload.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type SiteTextKey, slotForText } from '@/lib/site-texts'

const CACHE_TTL_MS = 5 * 60 * 1000

let cache: { rows: Record<string, string>; at: number } | null = null
let inFlight: Promise<Record<string, string>> | null = null

// Tiny pub-sub so live <SiteText> instances refresh when cache is invalidated.
type Listener = (rows: Record<string, string>) => void
const listeners = new Set<Listener>()
function broadcast(rows: Record<string, string>) {
  listeners.forEach(l => { try { l(rows) } catch { /* ignore */ } })
}

async function loadTexts(force = false): Promise<Record<string, string>> {
  const now = Date.now()
  if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.rows
  if (!force && inFlight) return inFlight
  const supabase = createClient()
  inFlight = supabase.from('site_texts').select('key, value').then(({ data }) => {
    const map: Record<string, string> = {}
    for (const row of (data as any[]) || []) map[row.key] = row.value
    cache = { rows: map, at: Date.now() }
    inFlight = null
    broadcast(map)
    return map
  })
  return inFlight
}

export function invalidateSiteTextCache() {
  cache = null
  inFlight = null
  // Force an immediate reload so all live <SiteText> instances refresh
  loadTexts(true)
}

export function SiteText({
  textKey, as = 'span', className, fallback,
}: {
  textKey: SiteTextKey
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div'
  className?: string
  fallback?: string
}) {
  const slot = slotForText(textKey)
  const [value, setValue] = useState<string>(fallback ?? slot.default)

  useEffect(() => {
    let cancelled = false

    // 1) Initial load — serves from cache if fresh, otherwise fetches.
    loadTexts().then(m => { if (!cancelled && m[textKey]) setValue(m[textKey]) })

    // 2) Subscribe for cache invalidations (admin save in another tab)
    const onUpdate: Listener = m => { if (!cancelled && m[textKey]) setValue(m[textKey]) }
    listeners.add(onUpdate)

    // 3) Background refresh every 5 minutes while mounted
    const interval = setInterval(() => loadTexts(true), CACHE_TTL_MS)

    return () => {
      cancelled = true
      listeners.delete(onUpdate)
      clearInterval(interval)
    }
  }, [textKey])

  const Tag = as as any
  return <Tag className={className} data-sitetext-key={textKey}>{value}</Tag>
}
