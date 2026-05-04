// Registry of admin-editable text blocks. Each slot has a stable key, a
// sensible default, a "long/short" hint for the editor, and a page+section
// grouping so the /admin/site-setup page can lay them out per page.

export type SiteTextKey =
  // Global
  | 'brand_name'
  | 'brand_tagline'
  | 'footer_byline'
  // Landing
  | 'landing_hero_eyebrow'
  | 'landing_hero_headline'
  | 'landing_hero_subheadline'
  | 'landing_hero_cta_primary'
  | 'landing_hero_cta_secondary'
  | 'landing_about_heading'
  | 'landing_about_paragraph'
  | 'landing_meet_rocky_heading'
  | 'landing_meet_rocky_body'
  | 'landing_meet_rocky_fact'
  | 'landing_cta_heading'
  | 'landing_cta_body'
  // Pricing
  | 'pricing_hero_eyebrow'
  | 'pricing_hero_headline'
  | 'pricing_hero_body'
  | 'pricing_cta_heading'
  | 'pricing_cta_body'
  // Auth
  | 'login_panel_quote'
  | 'register_panel_quote'

export type SiteTextKind = 'short' | 'long'

export type SiteTextSlot = {
  key: SiteTextKey
  label: string
  page: 'Global' | 'Landing' | 'Pricing' | 'Auth'
  kind: SiteTextKind
  default: string
  help?: string
}

export const SITE_TEXT_SLOTS: SiteTextSlot[] = [
  { key: 'brand_name',        page: 'Global',  kind: 'short', label: 'Brand name',       default: "Rocky's Retreat and Rambles", help: 'Shown in the header, footer, emails.' },
  { key: 'brand_tagline',     page: 'Global',  kind: 'short', label: 'Brand tagline',    default: 'Proper pet care, delivered with love.' },
  { key: 'footer_byline',     page: 'Global',  kind: 'short', label: 'Footer byline',    default: 'Built with ♥ by Jamie Neal. All rights reserved.' },

  { key: 'landing_hero_eyebrow',      page: 'Landing', kind: 'short', label: 'Hero — small label',       default: 'Walks · Day care · Overnight · Home visits' },
  { key: 'landing_hero_headline',     page: 'Landing', kind: 'short', label: 'Hero — headline',          default: 'Your pets, looked after like family.' },
  { key: 'landing_hero_subheadline',  page: 'Landing', kind: 'long',  label: 'Hero — sub-headline',      default: "Small, trusted and local. Real-time walk updates, vet-savvy handlers and a fully DBS-checked team who actually know your pet's name." },
  { key: 'landing_hero_cta_primary',  page: 'Landing', kind: 'short', label: 'Hero — primary button',    default: 'Get Started' },
  { key: 'landing_hero_cta_secondary',page: 'Landing', kind: 'short', label: 'Hero — secondary button',  default: 'See pricing' },

  { key: 'landing_about_heading',     page: 'Landing', kind: 'short', label: 'About — heading',          default: 'Why families choose us' },
  { key: 'landing_about_paragraph',   page: 'Landing', kind: 'long',  label: 'About — paragraph',        default: "We're a tiny local team — we walk fewer pets, spend more time with each one, and send you photos from every outing. That's the whole promise." },

  { key: 'landing_meet_rocky_heading',page: 'Landing', kind: 'short', label: 'Meet Rocky — heading',     default: 'Meet Rocky' },
  { key: 'landing_meet_rocky_body',   page: 'Landing', kind: 'long',  label: 'Meet Rocky — paragraph',   default: "Rocky is our namesake and head of quality control. A rescue Spaniel mix who's visited every park in a 10-mile radius, he'll personally vet each walker before they're let near your pet." },
  { key: 'landing_meet_rocky_fact',   page: 'Landing', kind: 'short', label: 'Meet Rocky — fun fact',    default: 'Favourite park: 12 different ones this month alone.' },

  { key: 'landing_cta_heading',       page: 'Landing', kind: 'short', label: 'Bottom CTA — heading',     default: 'Ready to book?' },
  { key: 'landing_cta_body',          page: 'Landing', kind: 'long',  label: 'Bottom CTA — body',        default: "Create an account, tell us about your pet, and we'll take care of the rest." },

  { key: 'pricing_hero_eyebrow',      page: 'Pricing', kind: 'short', label: 'Hero — eyebrow',           default: '2026 prices' },
  { key: 'pricing_hero_headline',     page: 'Pricing', kind: 'short', label: 'Hero — headline',          default: 'Simple, honest pricing.' },
  { key: 'pricing_hero_body',         page: 'Pricing', kind: 'long',  label: 'Hero — body',              default: 'Whether your dog needs a stroll or a sleepover, every package includes the same love and attention Rocky gets. No subscriptions, no hidden fees.' },
  { key: 'pricing_cta_heading',       page: 'Pricing', kind: 'short', label: 'Bottom CTA — heading',     default: 'Ready to book?' },
  { key: 'pricing_cta_body',          page: 'Pricing', kind: 'long',  label: 'Bottom CTA — body',        default: "Create an account, tell us about your dog, and we'll take care of the rest." },

  { key: 'login_panel_quote',         page: 'Auth',    kind: 'long',  label: 'Login panel quote',        default: "We don't just walk them. We get to know them." },
  { key: 'register_panel_quote',      page: 'Auth',    kind: 'long',  label: 'Register panel quote',     default: 'Join a little local team your pet will love.' },
]

export function slotForText(key: SiteTextKey): SiteTextSlot {
  return SITE_TEXT_SLOTS.find(s => s.key === key)!
}

export function slotsByPage() {
  const groups = new Map<string, SiteTextSlot[]>()
  for (const s of SITE_TEXT_SLOTS) {
    const arr = groups.get(s.page) || []
    arr.push(s); groups.set(s.page, arr)
  }
  return Array.from(groups.entries())
}
