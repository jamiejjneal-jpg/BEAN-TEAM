'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { slotFor, type SiteImageKey } from '@/lib/site-images'

/**
 * Image for a managed site-image slot.
 * Renders the slot's default immediately, then swaps to the admin-uploaded override once fetched.
 * Supports both `fill` layout and explicit width/height via a single `variant`.
 */
export function SiteImage({
  imageKey,
  variant,
  className,
  priority,
  sizes,
}: {
  imageKey: SiteImageKey
  variant: { kind: 'fill' } | { kind: 'sized'; width: number; height: number }
  className?: string
  priority?: boolean
  sizes?: string
}) {
  const slot = slotFor(imageKey)
  const [url, setUrl] = useState<string>(slot.defaultUrl)
  const [alt, setAlt] = useState<string>(slot.defaultAlt)

  useEffect(() => {
    let mounted = true
    try {
      const supabase = createClient()
      supabase
        .from('site_images')
        .select('url, alt')
        .eq('key', imageKey)
        .maybeSingle()
        .then(({ data }) => {
          if (!mounted || !data?.url) return
          setUrl(data.url)
          if (data.alt) setAlt(data.alt)
        }, () => { /* ignore — fall back to default */ })
    } catch { /* ignore — fall back to default */ }
    return () => { mounted = false }
  }, [imageKey])

  if (variant.kind === 'fill') {
    return (
      <Image
        src={url}
        alt={alt}
        fill
        className={className}
        priority={priority}
        sizes={sizes}
        unoptimized
      />
    )
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={variant.width}
      height={variant.height}
      className={className}
      priority={priority}
      unoptimized
    />
  )
}
