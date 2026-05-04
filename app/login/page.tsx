'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PawPrint, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SiteImage } from '@/components/shared/SiteImage'
import { friendlyDevice } from '@/lib/ua'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    // Look up role from the profiles table (source of truth) — user_metadata
    // may be missing/stale for users created before the role convention.
    let role: string = data.user?.user_metadata?.role || ''
    if (!role && data.user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      role = p?.role || 'client'
    }

    const dest = role === 'admin' ? '/admin' : role === 'walker' ? '/walker' : '/client'

    // Force Supabase to fully settle its session. `getUser()` re-validates
    // against the server, which guarantees the auth cookies are written to
    // document.cookie BEFORE we navigate — otherwise the target page can
    // hydrate with a stale null user and bounce us straight back here.
    await supabase.auth.getUser()

    // Record the successful sign-in (fire-and-forget — never blocks login).
    if (data.user) {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      supabase.from('login_history').insert({
        user_id: data.user.id,
        user_agent: ua,
        device: friendlyDevice(ua),
      }).then(({ error }) => { if (error) console.warn('[login_history]', error.message) })
    }

    toast.success('Welcome back!')
    // Use location.assign for the initial navigation — it's a full page load
    // that always includes the now-settled cookies. Once the destination
    // page has mounted, all in-app nav becomes SPA again.
    window.location.assign(dest)
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative">
        <SiteImage
          imageKey="login_bg"
          variant={{ kind: 'fill' }}
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-[#1A4331]/60 flex items-center justify-center p-12">
          <div className="text-center text-white">
            <PawPrint className="h-16 w-16 mx-auto mb-6 opacity-90" />
            <h2 className="font-heading text-4xl font-bold mb-4">Welcome Back</h2>
            <p className="text-white/80 text-lg max-w-md">Sign in to manage your walks, track your pups, and stay connected.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-[#F9F8F6]">
        <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-4 lg:hidden">
              <PawPrint className="h-7 w-7 text-[#1A4331]" />
              <span className="font-heading font-bold text-xl text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
            </div>
            <CardTitle className="text-2xl font-heading">Sign In</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="login-email-input"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-[#1A4331] hover:underline" data-testid="forgot-password-link">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="login-password-input"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit-button">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
              </Button>
            </form>
            <p className="text-sm text-center text-[#5C5C5C] mt-6">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-[#1A4331] font-medium hover:underline" data-testid="register-link">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
