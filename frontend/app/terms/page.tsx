import type { Metadata } from 'next'
import Link from 'next/link'
import { PawPrint } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: "Terms governing the use of Rocky's Retreat and Rambles pet care services.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <header className="bg-white border-b border-[#E5E3DB] py-4">
        <div className="max-w-3xl mx-auto px-6 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 text-[#1A4331]">
            <PawPrint className="h-6 w-6" />
            <span className="font-heading font-bold">Rocky&apos;s Retreat and Rambles</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-[#8A8A8A] mt-2">Last updated: 15 February 2026</p>
        </div>

        <section className="prose prose-sm max-w-none text-[#3C3C3C] space-y-4">
          <p>By creating an account or booking a service with <strong>Rocky&apos;s Retreat and Rambles</strong> you agree to these terms.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">1. The service</h2>
          <p>We offer dog walking, pet sitting, daycare, overnight stays, house sitting, and related ad-hoc services. Each booking is a separate contract — pricing and duration are shown at booking time.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">2. Your responsibilities as a client</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide accurate pet information including up-to-date vaccinations, medical conditions, allergies, and behavioural notes.</li>
            <li>Ensure aggressive or reactive pets are flagged in the profile <strong>before booking</strong>. We reserve the right to decline service for any pet that poses a serious risk to walkers, the public, or other pets.</li>
            <li>Provide safe access (key, code, or personal handover) and a working contact number on the day of the booking.</li>
            <li>Pay for services per the rate card. Outstanding invoices over 14 days may suspend further bookings.</li>
          </ul>

          <h2 className="font-heading text-xl font-semibold mt-8">3. Cancellations</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Walks &amp; 1-2-1 sessions: free cancellation up to 24 hours before. Within 24 hours, full charge applies.</li>
            <li>Daycare, overnight, house sitting: free up to 7 days before. Within 7 days, 50% charge. Within 48 hours, full charge.</li>
            <li>If we cancel due to walker illness or weather emergencies, you receive a full refund or rebook.</li>
          </ul>

          <h2 className="font-heading text-xl font-semibold mt-8">4. Liability &amp; insurance</h2>
          <p>We carry public liability and professional indemnity insurance for the services we provide. We are <strong>not</strong> liable for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Pre-existing medical conditions that flare up during care.</li>
            <li>Injuries caused by undisclosed behavioural issues.</li>
            <li>Damage to property caused by your pet during a stay (you remain responsible for your pet&apos;s actions).</li>
          </ul>
          <p>In the unfortunate event of an emergency, we will contact your registered vet and emergency contact immediately. Treatment costs are passed through to you.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">5. Photos &amp; gallery</h2>
          <p>By default, we share walk photos with you privately via the gallery. We may use anonymised photos for marketing only with your <strong>explicit written consent</strong>.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">6. Account suspension</h2>
          <p>We may suspend or terminate accounts that abuse staff, repeatedly no-show bookings, or breach these terms.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">7. Changes</h2>
          <p>We may update these terms; the &ldquo;Last updated&rdquo; date will reflect any changes. Continued use after a change constitutes acceptance.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">8. Governing law</h2>
          <p>These terms are governed by the laws of England and Wales. Any disputes will be handled in English courts.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">9. Contact</h2>
          <p><a href="mailto:hello@rockysretreatandrambles.com" className="text-[#1A4331] underline">hello@rockysretreatandrambles.com</a></p>
        </section>

        <Link href="/" className="inline-block text-sm text-[#1A4331] hover:underline">&larr; Back to homepage</Link>
      </main>
    </div>
  )
}
