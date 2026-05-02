'use client'

// Renders an admin-editable text block. Fetches `public.site_texts` rows
// once on mount (cheap, tiny table, public RLS) and keeps a module-level
// cache so subsequent <SiteText> calls during the same session are instant.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type SiteTextKey, slotForText } from '@/lib/site-texts'

let cachedRows: Record<string, string> | null = null
let inFlight: Promise<Record<string, string>> | null = null

async function loadTexts(): Promise<Record<string, string>> {
  if (cachedRows) return cachedRows
  if (inFlight) return inFlight
  const supabase = createClient()
  inFlight = supabase.from('site_texts').select('key, value').then(({ data }) => {
    const map: Record<string, string> = {}
    for (const row of (data as any[]) || []) map[row.key] = row.value
    cachedRows = map
    inFlight = null
    return map
  })
  return inFlight
}

export function invalidateSiteTextCache() {
  cachedRows = null
  inFlight = null
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
    loadTexts().then(m => {
      if (cancelled) return
      if (m[textKey]) setValue(m[textKey])
    })
    return () => { cancelled = true }
  }, [textKey])

  const Tag = as as any
  // Preserve newlines from multi-line admin edits
  return <Tag className={className} data-sitetext-key={textKey}>{value}</Tag>
}
