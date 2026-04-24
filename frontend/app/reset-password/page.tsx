'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PawPrint, Loader2, Lock, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [checking, setChecking] = useState(true)
  const [sessionValid, setSessionValid] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // After /auth/callback exchanged the code, a recovery session should exist.
    // If not, the link was bad/expired.
    supabase.auth.getUser().then(({ data }) => {
      setSessionValid(!!data.user)
      setChecking(false)
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }
    setSuccess(true)
    toast.success('Password updated')

    // Sign out so the user logs back in cleanly with their new password.
    setTimeout(async () => {
      await supabase.auth.signOut()
      router.push('/login')
    }, 1800)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F9F8F6]" data-testid="reset-password-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <PawPrint className="h-7 w-7 text-[#1A4331]" />
            <span className="font-heading font-bold text-xl text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
          </div>
          {success ? (
            <>
              <div className="h-12 w-12 rounded-full bg-[#E8F0EC] flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-[#2D7A5D]" />
              </div>
              <CardTitle className="text-2xl font-heading">Password updated</CardTitle>
              <CardDescription>Redirecting you to sign in...</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl font-heading">Set a new password</CardTitle>
              <CardDescription>Choose a strong password you haven&apos;t used before.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-[#1A4331]" /></div>
          ) : !sessionValid && !success ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-[#E06D53]">This reset link is invalid or has expired.</p>
              <Link href="/forgot-password"><Button variant="outline" className="w-full" data-testid="request-new-link-button">Request a new link</Button></Link>
              <Link href="/login"><Button variant="ghost" className="w-full text-[#5C5C5C]">Back to sign in</Button></Link>
            </div>
          ) : !success ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
                  <Input id="password" type="password" className="pl-9" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="new-password-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
                  <Input id="confirm" type="password" className="pl-9" placeholder="Repeat your new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required data-testid="confirm-password-input" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="reset-password-submit-button">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...</> : 'Update password'}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
