// Pet species configuration — central source of truth for labels,
// icons, service-eligibility and species-specific form fields.
// UI imports from here so we stay DRY across pages.

import { Dog, Cat, Rabbit, Bird, Fish, Turtle, PawPrint } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type PetSpecies =
  | 'dog' | 'cat' | 'rabbit' | 'bird' | 'fish' | 'reptile' | 'small_mammal'

export const PET_SPECIES: {
  value: PetSpecies
  label: string
  pluralLabel: string
  icon: LucideIcon
  /** true = eligible for outdoor walk bookings (only dogs today) */
  walkable: boolean
  /** one-line hint shown in pickers */
  hint: string
}[] = [
  { value: 'dog',          label: 'Dog',          pluralLabel: 'Dogs',          icon: Dog,      walkable: true,  hint: 'Walks, playdates' },
  { value: 'cat',          label: 'Cat',          pluralLabel: 'Cats',          icon: Cat,      walkable: false, hint: 'Home visits, feeding' },
  { value: 'rabbit',       label: 'Rabbit',       pluralLabel: 'Rabbits',       icon: Rabbit,   walkable: false, hint: 'Feeding, hutch clean' },
  { value: 'bird',         label: 'Bird',         pluralLabel: 'Birds',         icon: Bird,     walkable: false, hint: 'Feeding, cage care' },
  { value: 'fish',         label: 'Fish',         pluralLabel: 'Fish',          icon: Fish,     walkable: false, hint: 'Tank checks, feeding' },
  { value: 'reptile',      label: 'Reptile',      pluralLabel: 'Reptiles',      icon: Turtle,   walkable: false, hint: 'Heat checks, feeding' },
  { value: 'small_mammal', label: 'Small Mammal', pluralLabel: 'Small Mammals', icon: PawPrint, walkable: false, hint: 'Hamsters, guinea pigs…' },
]

export function speciesConfig(value?: PetSpecies | null) {
  return PET_SPECIES.find(s => s.value === value) || PET_SPECIES[0]
}

// ============================================================
// Species-specific extra fields (stored in pets.details JSONB)
// ============================================================

export type FieldKind = 'text' | 'number' | 'toggle' | 'select'

export interface SpeciesField {
  key: string                 // stored in details[key]
  label: string
  kind: FieldKind
  placeholder?: string
  options?: { value: string; label: string }[]
  unit?: string               // e.g. "L", "°C", "cm"
}

export const SPECIES_FIELDS: Record<PetSpecies, SpeciesField[]> = {
  dog: [
    // dogs keep using the top-level columns; no extras in details
  ],
  cat: [
    { key: 'indoor_outdoor', label: 'Indoor / outdoor', kind: 'select', options: [
      { value: 'indoor', label: 'Indoor only' },
      { value: 'outdoor', label: 'Outdoor access' },
      { value: 'both', label: 'Both' },
    ]},
    { key: 'declawed', label: 'Declawed', kind: 'toggle' },
    { key: 'litter_preference', label: 'Litter preference', kind: 'text', placeholder: 'e.g. Clumping clay, unscented' },
  ],
  rabbit: [
    { key: 'housing', label: 'Housing', kind: 'select', options: [
      { value: 'indoor_cage', label: 'Indoor cage' },
      { value: 'outdoor_hutch', label: 'Outdoor hutch' },
      { value: 'free_roam', label: 'Free roam' },
    ]},
    { key: 'litter_trained', label: 'Litter-trained', kind: 'toggle' },
    { key: 'companion_pair', label: 'Bonded pair', kind: 'toggle' },
  ],
  bird: [
    { key: 'cage_size', label: 'Cage size', kind: 'text', placeholder: 'e.g. 80×50×70cm' },
    { key: 'wings_clipped', label: 'Wings clipped', kind: 'toggle' },
    { key: 'talks', label: 'Speech-trained', kind: 'toggle' },
    { key: 'diet_detail', label: 'Diet detail', kind: 'text', placeholder: 'Seeds, pellets, fresh fruit…' },
  ],
  fish: [
    { key: 'tank_size_l', label: 'Tank size', kind: 'number', unit: 'L', placeholder: '60' },
    { key: 'water_type', label: 'Water type', kind: 'select', options: [
      { value: 'fresh', label: 'Freshwater' },
      { value: 'salt', label: 'Saltwater / marine' },
      { value: 'brackish', label: 'Brackish' },
    ]},
    { key: 'temperature_c', label: 'Temperature', kind: 'number', unit: '°C', placeholder: '24' },
    { key: 'filter_type', label: 'Filter type', kind: 'text', placeholder: 'e.g. Canister, sponge' },
  ],
  reptile: [
    { key: 'enclosure', label: 'Enclosure type', kind: 'text', placeholder: 'e.g. Glass vivarium 120cm' },
    { key: 'heat_source', label: 'Heat source', kind: 'text', placeholder: 'e.g. Ceramic bulb, heat mat' },
    { key: 'humidity_pct', label: 'Humidity target', kind: 'number', unit: '%', placeholder: '60' },
    { key: 'uvb_lighting', label: 'UVB lighting', kind: 'toggle' },
  ],
  small_mammal: [
    { key: 'subspecies', label: 'Subspecies', kind: 'select', options: [
      { value: 'hamster', label: 'Hamster' },
      { value: 'guinea_pig', label: 'Guinea pig' },
      { value: 'rat', label: 'Rat' },
      { value: 'mouse', label: 'Mouse' },
      { value: 'ferret', label: 'Ferret' },
      { value: 'gerbil', label: 'Gerbil' },
      { value: 'chinchilla', label: 'Chinchilla' },
      { value: 'other', label: 'Other' },
    ]},
    { key: 'cage_type', label: 'Cage / tank type', kind: 'text', placeholder: 'e.g. Wire cage 90cm, glass tank' },
    { key: 'bedding', label: 'Bedding preference', kind: 'text', placeholder: 'e.g. Paper, hay, fleece' },
  ],
}
