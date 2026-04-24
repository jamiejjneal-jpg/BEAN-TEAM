'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { PET_SPECIES, type PetSpecies } from '@/lib/species'
import { PawPrint } from 'lucide-react'

// Species emojis for a warm, shareable look (matches the "Insta-post" vibe
// the admin asked for — one-line snapshot of the customer base).
const EMOJI: Record<PetSpecies, string> = {
  dog: '🐕',
  cat: '🐈',
  rabbit: '🐇',
  bird: '🐦',
  fish: '🐟',
  reptile: '🦎',
  small_mammal: '🐹',
}

export function SpeciesBreakdownWidget() {
  const supabase = createClient()
  const [counts, setCounts] = useState<Record<PetSpecies, number> | null>(null)

  useEffect(() => {
    let mounted = true
    supabase
      .from('dogs')
      .select('species')
      .eq('is_active', true)
      .then(({ data }) => {
        if (!mounted) return
        const tally: Record<string, number> = {}
        ;(data || []).forEach((r: any) => {
          const s = (r.species || 'dog') as string
          tally[s] = (tally[s] || 0) + 1
        })
        setCounts(tally as Record<PetSpecies, number>)
      })
    return () => { mounted = false }
  }, [])

  if (!counts) return null
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return (
      <Card className="bg-gradient-to-r from-[#E8F0EC] via-white to-[#FDF8EF] border-[#E5E3DB]" data-testid="species-breakdown-widget">
        <CardContent className="py-4 px-5 flex items-center gap-3 text-sm text-[#5C5C5C]">
          <PawPrint className="h-5 w-5 text-[#1A4331] shrink-0" />
          <span>No pets registered yet — once clients add pets, you&apos;ll see a little roll-call here.</span>
        </CardContent>
      </Card>
    )
  }

  const entries = PET_SPECIES
    .filter(s => (counts[s.value] || 0) > 0)
    .map(s => ({ species: s, count: counts[s.value] || 0 }))

  return (
    <Card className="bg-gradient-to-r from-[#E8F0EC] via-white to-[#FDF8EF] border-[#E5E3DB]" data-testid="species-breakdown-widget">
      <CardContent className="py-4 px-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#8A8A8A] shrink-0">Our pack</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#1A1A1A]">
          {entries.map((e, i) => (
            <span key={e.species.value} className="flex items-center gap-1.5" data-testid={`species-tally-${e.species.value}`}>
              <span className="text-base leading-none" aria-hidden>{EMOJI[e.species.value]}</span>
              <span className="font-heading font-semibold text-[#1A4331]">{e.count}</span>
              <span className="text-[#5C5C5C]">{e.count === 1 ? e.species.label.toLowerCase() : e.species.pluralLabel.toLowerCase()}</span>
              {i < entries.length - 1 && <span className="text-[#D1CFC6] ml-2" aria-hidden>·</span>}
            </span>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-[#8A8A8A]">{total} pet{total !== 1 ? 's' : ''} in total</span>
      </CardContent>
    </Card>
  )
}
