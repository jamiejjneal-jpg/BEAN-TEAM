'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Small horizontal strip of the 6 most recent walk_logs.photo_url values
// tagged to a given pet. Silent-fails if none — the pet card stays clean.
// NB: column is still called `dog_id` in the DB for backwards compat.
export function PetPhotoStrip({ petId }: { petId: string }) {
  const supabase = createClient()
  const [photos, setPhotos] = useState<{ id: string; photo_url: string; caption: string | null }[] | null>(null)

  useEffect(() => {
    let mounted = true
    supabase
      .from('walk_logs')
      .select('id, photo_url, caption')
      .eq('dog_id', petId)
      .not('photo_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => { if (mounted) setPhotos((data as any[]) || []) })
    return () => { mounted = false }
  }, [petId])

  if (!photos || photos.length === 0) return null
  return (
    <div className="mt-3" data-testid={`pet-photo-strip-${petId}`}>
      <p className="text-[10px] font-medium text-[#8A8A8A] uppercase tracking-wide mb-1.5">Recent photos</p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {photos.map(p => (
          <a
            key={p.id}
            href={p.photo_url}
            target="_blank"
            rel="noopener noreferrer"
            title={p.caption || ''}
            className="shrink-0 h-14 w-14 rounded-md overflow-hidden border border-[#E5E3DB] hover:border-[#1A4331]"
          >
            <img src={p.photo_url} alt={p.caption || ''} className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  )
}
