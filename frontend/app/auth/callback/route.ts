import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles the redirect back from Supabase for password recovery (and any
// other magic-link style flows). Exchanges the PKCE `code` for a session
// stored in cookies, then forwards the user to `next` (defaults to home).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/'
  const errorDesc = searchParams.get('error_description')

  if (errorDesc) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDesc)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
