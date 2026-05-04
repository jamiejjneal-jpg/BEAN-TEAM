import Link from 'next/link'
import { PawPrint } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4" data-testid="not-found-page">
        <div className="h-14 w-14 rounded-full bg-[#E8F0EC] mx-auto flex items-center justify-center">
          <PawPrint className="h-7 w-7 text-[#1A4331]" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Page not found</h1>
        <p className="text-[#5C5C5C]">Rocky sniffed around but couldn&apos;t find this one.</p>
        <Link href="/" className="inline-flex items-center px-4 h-10 rounded-md bg-[#1A4331] text-white font-medium hover:bg-[#143328]" data-testid="notfound-home-link">Back to home</Link>
      </div>
    </div>
  )
}
