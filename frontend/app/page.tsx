import Link from 'next/link'
import { PawPrint, Shield, Clock, MapPin, Star, Users, ArrowRight, CheckCircle } from 'lucide-react'
import { SiteImage } from '@/components/shared/SiteImage'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <header className="bg-[#F9F8F6]/80 backdrop-blur-xl border-b border-[#E5E3DB] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PawPrint className="h-7 w-7 text-[#1A4331]" />
            <span className="font-heading font-bold text-xl text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/pricing" data-testid="nav-pricing" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[#1A4331] hover:bg-[#E8F0EC] rounded-lg px-4 py-2 transition-colors">
              Pricing
            </Link>
            <Link href="/login" data-testid="nav-login" className="text-sm font-medium text-[#5C5C5C] hover:text-[#1A4331] transition-colors px-4 py-2">
              Sign In
            </Link>
            <Link href="/register" data-testid="nav-register" className="bg-[#1A4331] text-white hover:bg-[#265C45] rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 bg-[#E8F0EC] rounded-full px-4 py-1.5 mb-6">
                <span className="h-2 w-2 rounded-full bg-[#2D7A5D] animate-pulse" />
                <span className="text-xs font-medium text-[#1A4331] tracking-wide">Trusted by hundreds of pet owners</span>
              </div>
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-none text-[#1A1A1A] mb-6">
                Your dog deserves the <span className="text-[#1A4331]">best walks</span>
              </h1>
              <p className="text-lg text-[#5C5C5C] leading-relaxed mb-8 max-w-lg">
                Connect with professional, vetted dog walkers in your area. Real-time updates, reliable scheduling, and happy tails guaranteed.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/register" data-testid="hero-cta" className="inline-flex items-center justify-center gap-2 bg-[#1A4331] text-white hover:bg-[#265C45] rounded-lg px-8 py-3 text-sm font-medium transition-colors">
                  Book a Walk <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/register?role=walker" data-testid="hero-walker-cta" className="inline-flex items-center justify-center gap-2 border border-[#1A4331] text-[#1A4331] hover:bg-[#E8F0EC] rounded-lg px-8 py-3 text-sm font-medium transition-colors">
                  Become a Walker
                </Link>
              </div>
            </div>

            <div className="relative animate-fade-in stagger-2">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/3]">
                <SiteImage
                  imageKey="landing_hero"
                  variant={{ kind: 'fill' }}
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A4331]/30 to-transparent" />
              </div>
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl border border-[#E5E3DB] shadow-lg p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#E8F0EC] flex items-center justify-center">
                  <Star className="h-5 w-5 text-[#DDA74F]" />
                </div>
                <div>
                  <p className="text-sm font-semibold">4.9 Rating</p>
                  <p className="text-xs text-[#8A8A8A]">500+ happy walks</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-32 bg-white border-y border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1A1A] mb-4">Why Choose Rocky&apos;s Retreat and Rambles?</h2>
            <p className="text-[#5C5C5C] max-w-2xl mx-auto">Everything you need to keep your pet happy, healthy, and exercised.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: 'Vetted Walkers', desc: 'Every walker is background-checked and trained in pet first aid. Your pet is in safe hands.' },
              { icon: Clock, title: 'Real-time Updates', desc: 'Get notified when your walker arrives, picks up, and drops off your dog. Stay informed every step.' },
              { icon: MapPin, title: 'Flexible Booking', desc: 'Book recurring walks or one-offs. Standard, extended, or group walks to suit your schedule.' },
            ].map((item, i) => (
              <div key={i} className={`bg-[#F9F8F6] border border-[#E5E3DB] rounded-xl p-8 hover:-translate-y-1 hover:border-[#1A4331]/30 transition-all duration-300 animate-fade-in stagger-${i + 1}`}>
                <div className="h-12 w-12 rounded-xl bg-[#E8F0EC] flex items-center justify-center mb-5">
                  <item.icon className="h-6 w-6 text-[#1A4331]" />
                </div>
                <h3 className="font-heading text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-[#5C5C5C] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1A1A] mb-4">How It Works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Register & Add Your Dog', desc: 'Create your account, add your dog\'s details, and set your preferences.' },
              { step: '02', title: 'Browse & Book', desc: 'Find available walkers in your area, check reviews, and book a walk that suits your schedule.' },
              { step: '03', title: 'Track & Review', desc: 'Receive real-time notifications during the walk. Rate your walker when your pup gets home.' },
            ].map((item, i) => (
              <div key={i} className={`text-center animate-fade-in stagger-${i + 2}`}>
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[#1A4331] text-white font-heading font-bold text-lg mb-5">
                  {item.step}
                </div>
                <h3 className="font-heading text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-[#5C5C5C] leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-[#FDF8EF] border-y border-[#DDA74F]/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-[#DDA74F]/15 text-[#8A6A2A] rounded-full px-3 py-1 text-xs font-medium mb-4">
            Simple, transparent pricing
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1A1A] mb-3">See our walk packages</h2>
          <p className="text-[#5C5C5C] mb-6 max-w-xl mx-auto">Standard, extended and group walks. No hidden fees, no subscriptions.</p>
          <Link href="/pricing" data-testid="landing-pricing-cta" className="inline-flex items-center justify-center gap-2 bg-[#1A4331] text-white hover:bg-[#265C45] rounded-lg px-7 py-3 text-sm font-medium transition-colors">
            View Pricing <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="py-20 lg:py-32 bg-[#1A4331]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-[#8EA396] mb-8 max-w-lg mx-auto">
            Join Rocky&apos;s Retreat and Rambles today and give your dog the exercise and companionship they deserve.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-white text-[#1A4331] hover:bg-[#E8F0EC] rounded-lg px-8 py-3 text-sm font-medium transition-colors">
              Sign Up as Client <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/register?role=walker" className="inline-flex items-center justify-center gap-2 border border-white/30 text-white hover:bg-white/10 rounded-lg px-8 py-3 text-sm font-medium transition-colors">
              Join as Walker
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-white border-t border-[#E5E3DB] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <PawPrint className="h-5 w-5 text-[#1A4331]" />
              <span className="font-heading font-bold text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
            </div>
            <p className="text-sm text-[#8A8A8A]">
              © {new Date().getFullYear()} Rocky&apos;s Retreat and Rambles · Built with <span aria-hidden>♥</span> by <span className="font-medium text-[#1A4331]">Jamie Neal</span>. All rights reserved.
              <Link href="/pricing" className="ml-3 hover:text-[#1A4331]">Pricing</Link>
              <span className="mx-2">·</span>
              <Link href="/privacy" className="hover:text-[#1A4331]" data-testid="footer-privacy">Privacy</Link>
              <span className="mx-2">·</span>
              <Link href="/terms" className="hover:text-[#1A4331]" data-testid="footer-terms">Terms</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
