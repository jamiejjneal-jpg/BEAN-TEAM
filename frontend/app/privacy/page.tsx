import type { Metadata } from 'next'
import Link from 'next/link'
import { PawPrint } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: "How Rocky's Retreat and Rambles handles your personal data under UK GDPR.",
}

export default function PrivacyPage() {
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
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-[#8A8A8A] mt-2">Last updated: 15 February 2026</p>
        </div>

        <section className="prose prose-sm max-w-none text-[#3C3C3C] space-y-4">
          <p><strong>Rocky&apos;s Retreat and Rambles</strong> (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is a UK-based pet care service. We take your privacy seriously and process personal data in line with the UK GDPR and the Data Protection Act 2018.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">1. What we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account info</strong>: name, email, phone, address.</li>
            <li><strong>Pet info</strong>: species, breed, age, weight, vet details, medical notes, behavioural notes, photos.</li>
            <li><strong>Booking history</strong>: walks, visits, dates, times, photos taken during walks, walker notes.</li>
            <li><strong>Login activity</strong>: timestamp, browser/device hint, partial IP — used solely to spot suspicious access.</li>
            <li><strong>Payment data</strong>: handled by our payment processor; we never store card numbers.</li>
          </ul>

          <h2 className="font-heading text-xl font-semibold mt-8">2. Why we use it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To deliver the booked services safely (your walker needs vet info, address, etc.).</li>
            <li>To send booking confirmations, reminders, and walk-photo notifications.</li>
            <li>To run the business (invoicing, audit logs, dispute resolution).</li>
            <li>Where you opt-in: weekly digest emails and marketing updates.</li>
          </ul>

          <h2 className="font-heading text-xl font-semibold mt-8">3. Who sees your data</h2>
          <p>Only your assigned walker(s), the admin team, and our infrastructure providers. We use:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> (database + authentication, EU-hosted).</li>
            <li><strong>Resend</strong> (transactional email delivery).</li>
            <li><strong>Cloudflare</strong> (web hosting + CDN).</li>
          </ul>
          <p>We never sell your data. We never share with third parties for marketing.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">4. How long we keep it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Active account data: as long as your account is active.</li>
            <li>Booking records: 6 years after the booking (HMRC requirement).</li>
            <li>Login history: 90 days (auto-purged).</li>
            <li>Audit log: 12 months (auto-purged).</li>
          </ul>

          <h2 className="font-heading text-xl font-semibold mt-8">5. Your rights (UK GDPR Article 15-22)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access</strong>: ask for a copy of your data — we&apos;ll send a JSON export.</li>
            <li><strong>Rectification</strong>: edit any detail directly in the app, or email us.</li>
            <li><strong>Erasure (&ldquo;right to be forgotten&rdquo;)</strong>: email us and we&apos;ll permanently delete your account and pets within 30 days. Note: we&apos;re required to keep tax-relevant booking records for 6 years.</li>
            <li><strong>Portability</strong>: download your data via Settings → Export.</li>
            <li><strong>Object</strong>: opt out of marketing in Settings → Notifications.</li>
            <li><strong>Complain</strong>: to the UK ICO at <a href="https://ico.org.uk" className="text-[#1A4331] underline">ico.org.uk</a>.</li>
          </ul>

          <h2 className="font-heading text-xl font-semibold mt-8">6. Cookies</h2>
          <p>We use only essential cookies for authentication. We don&apos;t use marketing or tracking cookies.</p>

          <h2 className="font-heading text-xl font-semibold mt-8">7. Contact us</h2>
          <p>Questions or rights requests: <a href="mailto:hello@rockysretreatandrambles.com" className="text-[#1A4331] underline">hello@rockysretreatandrambles.com</a></p>
        </section>

        <Link href="/" className="inline-block text-sm text-[#1A4331] hover:underline">&larr; Back to homepage</Link>
      </main>

      <footer className="py-6 text-center text-xs text-[#9C8E7A]">
        © {new Date().getFullYear()} Rocky&apos;s Retreat and Rambles · Built with <span aria-hidden>♥</span> by <span className="font-medium">Jamie Neal</span>. All rights reserved.
      </footer>
    </div>
  )
}