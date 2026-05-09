import type { Metadata } from 'next'
import { Outfit, Manrope } from 'next/font/google'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/components/auth/AuthProvider'
import PwaRegister from '@/components/pwa/PwaRegister'
import OnlineStatus from '@/components/pwa/OnlineStatus'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import RefreshButton from '@/components/pwa/RefreshButton'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://rockysretreatandrambles.com'),
  title: {
    default: "Rocky's Retreat and Rambles — Professional Pet Care Service",
    template: "%s | Rocky's Retreat and Rambles",
  },
  description: "Trusted local dog walking, pet sitting, daycare and overnight care. Book walks, manage your pet's profile, and stay connected with your walker.",
  keywords: ['dog walker', 'pet sitter', 'dog daycare', 'overnight pet care', 'house sitting', 'UK pet care'],
  authors: [{ name: "Rocky's Retreat and Rambles" }],
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: "Rocky's Retreat and Rambles",
    title: "Rocky's Retreat and Rambles — Professional Pet Care Service",
    description: "Trusted local dog walking, pet sitting, daycare and overnight care.",
    images: [{ url: '/rocky-hero.jpg', width: 1200, height: 630, alt: "Rocky — our happy retreat resident" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Rocky's Retreat and Rambles",
    description: "Trusted local dog walking, pet sitting, daycare and overnight care.",
    images: ['/rocky-hero.jpg'],
  },
  robots: { index: true, follow: true },
  manifest: '/manifest.json',
  themeColor: '#1A4331',
  appleWebApp: { capable: true, title: "Rocky's", statusBarStyle: 'default' },
  icons: { icon: '/favicon.ico', apple: '/rocky-square.jpg' },
}

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: "Rocky's Retreat and Rambles",
  description: 'Professional dog walking, pet sitting, daycare, and overnight care.',
  image: 'https://rockysretreatandrambles.com/rocky-hero.jpg',
  priceRange: '££',
  areaServed: { '@type': 'Country', name: 'United Kingdom' },
  // Update these once you have a real business address & phone:
  // address: { '@type': 'PostalAddress', addressCountry: 'GB' },
  // telephone: '+44 ...',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${manrope.variable}`}>
      <head>
        {/* Speed up first DB call by ~150-300ms */}
        <link rel="preconnect" href="https://udoeczxwrnmqbxtzybmt.supabase.co" />
        <link rel="dns-prefetch" href="https://udoeczxwrnmqbxtzybmt.supabase.co" />
        <link rel="stylesheet" href="/styles.css" />
        {/* Local-business structured data for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <OnlineStatus />
        <AuthProvider>
          {children}
          <PwaRegister />
          <InstallPrompt />
          <RefreshButton />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#FFFFFF',
                border: '1px solid #E5E3DB',
                color: '#1A1A1A',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
