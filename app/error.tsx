'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4" data-testid="error-boundary">
        <div className="h-14 w-14 rounded-full bg-[#FDEDEA] mx-auto flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-[#E06D53]" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Something went wrong</h1>
        <p className="text-[#5C5C5C]">A gremlin slipped into the kennel. Try again, or email <a href="mailto:hello@rockysretreatandrambles.com" className="text-[#1A4331] underline">hello@rockysretreatandrambles.com</a> if it keeps happening.</p>
        {error?.digest && <p className="text-[10px] text-[#9C8E7A]">Error ID: {error.digest}</p>}
        <div className="flex gap-2 justify-center">
          <button onClick={reset} className="px-4 h-10 rounded-md bg-[#1A4331] text-white font-medium hover:bg-[#143328]" data-testid="error-retry">Try again</button>
          <Link href="/" className="px-4 h-10 inline-flex items-center rounded-md border border-[#E5E3DB] font-medium hover:bg-[#F2F0EB]">Back home</Link>
        </div>
      </div>
    </div>
  )
}
