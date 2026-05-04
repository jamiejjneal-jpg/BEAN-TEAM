// Registry of admin-editable images on public pages.
// Key = identifier stored in `site_images` table; defaultUrl = fallback when no override exists.
export type SiteImageKey =
  | 'landing_hero'
  | 'pricing_portrait'
  | 'login_bg'
  | 'register_bg'
  | 'site_logo'

export type SiteImageSlot = {
  key: SiteImageKey
  label: string
  description: string
  aspect: string // tailwind aspect hint for the admin preview
  defaultUrl: string
  defaultAlt: string
}

export const SITE_IMAGE_SLOTS: SiteImageSlot[] = [
  {
    key: 'site_logo',
    label: 'Site logo',
    description: 'Shown in the site header, emails and printable invoices. Use a transparent PNG or SVG, square/round-friendly.',
    aspect: 'aspect-square',
    defaultUrl: '',
    defaultAlt: "Rocky's Retreat and Rambles logo",
  },
  {
    key: 'landing_hero',
    label: 'Landing — Hero',
    description: 'Main photo on the homepage hero (next to the headline).',
    aspect: 'aspect-[4/3]',
    defaultUrl: '/rocky-hero.jpg',
    defaultAlt: 'Rocky — our namesake and head of walks',
  },
  {
    key: 'pricing_portrait',
    label: 'Pricing — Rocky Portrait',
    description: 'Round portrait on the pricing page hero.',
    aspect: 'aspect-square',
    defaultUrl: '/rocky-square.jpg',
    defaultAlt: 'Rocky',
  },
  {
    key: 'login_bg',
    label: 'Login — Side Panel',
    description: 'Large background image on the left of the sign-in page.',
    aspect: 'aspect-[3/4]',
    defaultUrl: 'https://images.unsplash.com/photo-1773982281923-71fe1c8eacb5?w=1200&q=80',
    defaultAlt: 'Earthy green abstract background',
  },
  {
    key: 'register_bg',
    label: 'Register — Side Panel',
    description: 'Large background image on the left of the sign-up page.',
    aspect: 'aspect-[3/4]',
    defaultUrl: 'https://images.unsplash.com/photo-1674224624366-b8c6cf5ac3d2?w=1200&q=80',
    defaultAlt: 'Happy dog portrait',
  },
]

export function slotFor(key: SiteImageKey): SiteImageSlot {
  return SITE_IMAGE_SLOTS.find(s => s.key === key)!
}

// Build a map { key -> url } from DB rows, falling back to each slot's default.
export function resolveSiteImages(
  rows: { key: string; url: string }[] | null | undefined
): Record<SiteImageKey, string> {
  const overrides = new Map<string, string>((rows || []).map(r => [r.key, r.url]))
  const out = {} as Record<SiteImageKey, string>
  for (const s of SITE_IMAGE_SLOTS) {
    out[s.key] = overrides.get(s.key) || s.defaultUrl
  }
  return out
}
