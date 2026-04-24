import type { Metadata } from 'next'
import { Outfit, Manrope } from 'next/font/google'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/components/auth/AuthProvider'
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
  title: "Rocky's Retreat and Rambles - Professional Dog Walking Service",
  description: 'Connect with trusted dog walkers in your area. Book walks, track your pet, and manage your dog walking business.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${manrope.variable}`}>
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          {children}
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
