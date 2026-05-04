import Link from 'next/link'
import { PawPrint, Check, Clock, Home, Moon, House, Dog, ArrowRight, PawPrint as PawPrintIcon, Plus } from 'lucide-react'
import { SiteImage } from '@/components/shared/SiteImage'
import { SiteText } from '@/components/shared/SiteText'
import { ExtraServicesSection } from '@/components/shared/ExtraServicesSection'

type Tier = { label: string; price: string; sub?: string }

const services: { name: string; icon: any; tagline: string; tiers: Tier[]; location: string; accent: string }[] = [
  {
    name: 'Dog Walking',
    icon: PawPrintIcon,
    tagline: 'Off-lead adventures, play and socialising.',
    location: 'Out and about',
    accent: '#1A4331',
    tiers: [
      { label: '30 minute walk', price: '£12' },
      { label: '1 hour walk', price: '£15' },
      { label: '1 hour walk (2 dogs)', price: '£25' },
    ],
  },
  {
    name: 'Day Care',
    icon: Home,
    tagline: 'Your pup spends the day with Rocky in my home.',
    location: 'In my home',
    accent: '#DDA74F',
    tiers: [
      { label: 'Up to 4 hours', price: '£20' },
      { label: '9am – 4pm (approx)', price: '£30' },
      { label: 'Extended (10+ hrs)', price: '£35' },
    ],
  },
  {
    name: 'Overnight Stay',
    icon: Moon,
    tagline: 'A cosy sleepover with full next-day care.',
    location: 'In my home',
    accent: '#265C45',
    tiers: [
      { label: 'Per 24 hours', price: '£50', sub: 'Example: Mon 5pm → Tues 5pm. Includes overnight stay, full next-day care, and transport.' },
    ],
  },
  {
    name: 'House Sitting',
    icon: House,
    tagline: 'I come to yours — your dog stays in their own space.',
    location: 'In your home',
    accent: '#8EA396',
    tiers: [
      { label: 'Per 24 hours', price: '£80', sub: 'Example: Mon 5pm → Tues 5pm. Includes overnight stay, full next-day care, and transport.' },
    ],
  },
]

const extras = [
  { label: 'Second dog — Day Care', value: '+£10' },
  { label: 'Second dog — Overnight Care', value: '+£15' },
  { label: 'Second dog — House Sitting', value: '+£15' },
]

const surcharges = [
  { label: 'Weekends', value: '+ 0.5× booking price' },
  { label: 'Bank holidays', value: '+ 1× booking price' },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <header className="sticky top-0 z-50 bg-[#F9F8F6]/90 backdrop-blur-md border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <PawPrint className="h-6 w-6 text-[#1A4331]" />
            <span className="font-heading font-bold text-lg text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-[#5C5C5C] hover:text-[#1A4331] px-4 py-2">Sign In</Link>
            <Link href="/register" className="bg-[#1A4331] text-white hover:bg-[#265C45] rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">Get Started</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#DDA74F]/15 text-[#8A6A2A] rounded-full px-3 py-1 text-xs font-medium mb-4">
              <SiteText textKey="pricing_hero_eyebrow" />
            </div>
            <SiteText textKey="pricing_hero_headline" as="h1" className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1A1A1A] leading-[1.05] mb-4" />
            <SiteText textKey="pricing_hero_body" as="p" className="text-[#5C5C5C] text-base sm:text-lg max-w-md leading-relaxed" />
          </div>
          <div className="relative w-56 h-56 sm:w-72 sm:h-72 rounded-full overflow-hidden shadow-xl border-4 border-white ring-4 ring-[#DDA74F]/30 mx-auto lg:mx-0">
            <SiteImage imageKey="pricing_portrait" variant={{ kind: 'fill' }} className="object-cover" />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#1A4331]/80 to-transparent text-white text-xs py-3 px-4 text-center font-medium">Rocky · Head of Walks</div>
          </div>
        </div>
      </section>

      {/* Service tiles */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid md:grid-cols-2 gap-5">
          {services.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.name} className="group relative bg-white rounded-2xl border border-[#E5E3DB] p-6 hover:shadow-lg transition-shadow overflow-hidden">
                <div className="absolute top-0 right-0 h-24 w-24 rounded-full opacity-10 blur-2xl -translate-y-4 translate-x-4" style={{ background: s.accent }} />
                <div className="flex items-start justify-between mb-4 relative">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.accent}15`, color: s.accent }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-heading font-bold text-xl" style={{ color: s.accent }}>{s.name}</h2>
                      <p className="text-xs text-[#8A8A8A] mt-0.5">{s.location}</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#5C5C5C] mb-5">{s.tagline}</p>
                <div className="space-y-2">
                  {s.tiers.map((t) => (
                    <div key={t.label} className="flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg bg-[#F9F8F6] border border-[#F2F0EB]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A]">{t.label}</p>
                        {t.sub && <p className="text-xs text-[#8A8A8A] mt-0.5 leading-relaxed">{t.sub}</p>}
                      </div>
                      <span className="font-heading font-bold text-lg shrink-0" style={{ color: s.accent }}>{t.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Extras & surcharges */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-[#E8F0EC] flex items-center justify-center"><Plus className="h-4 w-4 text-[#1A4331]" /></div>
            <h3 className="font-heading font-bold text-lg text-[#1A4331]">Extras</h3>
          </div>
          <ul className="space-y-2">
            {extras.map((e) => (
              <li key={e.label} className="flex items-center justify-between text-sm py-2 border-b border-[#F2F0EB] last:border-0">
                <span className="text-[#3C3C3C]">{e.label}</span>
                <span className="font-mono font-semibold text-[#1A4331]">{e.value}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-[#FDF8EF] rounded-2xl border border-[#DDA74F]/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-[#DDA74F]/20 flex items-center justify-center"><Clock className="h-4 w-4 text-[#DDA74F]" /></div>
            <h3 className="font-heading font-bold text-lg text-[#8A6A2A]">Weekend & holiday rates</h3>
          </div>
          <ul className="space-y-2">
            {surcharges.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-sm py-2 border-b border-[#DDA74F]/20 last:border-0">
                <span className="text-[#3C3C3C]">{s.label}</span>
                <span className="font-mono font-semibold text-[#8A6A2A]">{s.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#8A6A2A]/80 mt-4">Applied on top of the base booking price.</p>
        </div>
      </section>

      <ExtraServicesSection />

      {/* CTA */}
      <section className="py-16 lg:py-20 bg-[#1A4331]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <SiteText textKey="pricing_cta_heading" as="h2" className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3" />
          <SiteText textKey="pricing_cta_body" as="p" className="text-white/80 mb-8 max-w-xl mx-auto" />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 bg-white text-[#1A4331] hover:bg-[#F9F8F6] rounded-lg px-7 py-3 text-sm font-medium transition-colors">
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 border border-white/30 text-white hover:bg-white/10 rounded-lg px-7 py-3 text-sm font-medium transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-[#8A8A8A] space-y-2">
        <Link href="/" className="hover:text-[#1A4331]">&larr; Back to home</Link>
        <p className="text-xs text-[#9C8E7A]">© {new Date().getFullYear()} Rocky’s Retreat and Rambles · Built with <span aria-hidden>♥</span> by <span className="font-medium">Jamie Neal</span>. All rights reserved.</p>
      </footer>
    </div>
  )
}
