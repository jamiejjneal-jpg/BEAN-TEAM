'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PawPrint, Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F9F8F6]" data-testid="forgot-password-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <PawPrint className="h-7 w-7 text-[#1A4331]" />
            <span className="font-heading font-bold text-xl text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
          </div>
          {sent ? (
            <>
              <div className="h-12 w-12 rounded-full bg-[#E8F0EC] flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-[#2D7A5D]" />
              </div>
              <CardTitle className="text-2xl font-heading">Check your email</CardTitle>
              <CardDescription>
                We&apos;ve sent a password reset link to <span className="font-medium text-[#1A1A1A]">{email}</span>. The link will expire in 1 hour.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl font-heading">Reset your password</CardTitle>
              <CardDescription>Enter your email and we&apos;ll send you a link to reset your password.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-[#5C5C5C] text-center">
                Didn&apos;t get it? Check spam, then{' '}
                <button onClick={() => setSent(false)} className="text-[#1A4331] font-medium hover:underline" data-testid="try-again-button">
                  try again
                </button>
                .
              </p>
              <Link href="/login" className="block">
                <Button variant="outline" className="w-full" data-testid="back-to-login-button">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="forgot-password-email-input"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="forgot-password-submit-button">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</> : 'Send reset link'}
              </Button>
              <Link href="/login" className="block">
                <Button type="button" variant="ghost" className="w-full text-[#5C5C5C]" data-testid="back-to-login-button">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to sign in
                </Button>
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
