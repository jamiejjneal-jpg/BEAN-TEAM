import { NextResponse, type NextRequest } from 'next/server'

// Very small middleware. Its only job is to put the right Cache-Control
// headers on HTML responses so Cloudflare (or any proxy) never serves stale
// HTML referencing old hashed chunk filenames after a deploy.
//
// Auth / role separation is handled client-side in DashboardLayout AND at the
// database layer by Supabase RLS. We deliberately DO NOT call
// supabase.auth.getUser() here — on a fresh sign-in the browser hasn't yet
// propagated its auth cookies to this request, so getUser() would return null
// and redirect the user back to /login. That was the "login just refreshes"
// bug. Trusting the client-side guard is safer because RLS is the real gate.
export function middleware(_request: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

export const config = {
  matcher: [
    '/admin/:path*', '/walker/:path*', '/client/:path*',
    '/login', '/register', '/forgot-password', '/reset-password',
    '/', '/pricing',
  ],
}
