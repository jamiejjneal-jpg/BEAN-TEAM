'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PawPrint, Loader2, Users, Dog } from 'lucide-react'
import { toast } from 'sonner'
import { SiteImage } from '@/components/shared/SiteImage'
import { triggerAutoEmail } from '@/lib/autoEmail'

function RegisterForm() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'client' as 'client' | 'walker',
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  function update(field: string, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          role: formData.role,
          phone: formData.phone,
        },
      },
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: formData.email,
          full_name: formData.fullName,
          role: formData.role,
          phone: formData.phone,
        }, { onConflict: 'id' })

        if (formData.role === 'walker') {
          await supabase.from('walker_profiles').upsert({ id: data.user.id }, { onConflict: 'id' })
        }
        // Fire the matching welcome automation (no-op if admin hasn't enabled it)
        triggerAutoEmail(formData.role === 'walker' ? 'welcome_walker' : 'welcome_client',
          { email: formData.email, full_name: formData.fullName })
      } catch (e) {
        console.error('Profile creation error:', e)
      }
    }

    toast.success('Account created successfully!')
    router.push(formData.role === 'walker' ? '/walker' : '/client')
    router.refresh()
    setLoading(false)
  }

  const roles = [
    { value: 'client', label: 'Client', desc: 'Book walks for your dog', icon: Dog },
    { value: 'walker', label: 'Walker', desc: 'Walk dogs and earn', icon: Users },
  ]

  return (
    <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
      <CardHeader className="text-center pb-2">
        <div className="flex items-center justify-center gap-2 mb-4 lg:hidden">
          <PawPrint className="h-7 w-7 text-[#1A4331]" />
          <span className="font-heading font-bold text-xl text-[#1A4331]">Rocky&apos;s Retreat and Rambles</span>
        </div>
        <CardTitle className="text-2xl font-heading">Create Account</CardTitle>
        <CardDescription>Join Rocky&apos;s Retreat and Rambles and get started</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label>I am a...</Label>
            <div className="grid grid-cols-2 gap-3">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => update('role', r.value)}
                  data-testid={`role-${r.value}`}
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border text-center transition-all ${
                    formData.role === r.value
                      ? 'border-[#1A4331] bg-[#E8F0EC] text-[#1A4331]'
                      : 'border-[#E5E3DB] hover:border-[#D1CFC7] text-[#5C5C5C]'
                  }`}
                >
                  <r.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-[10px] text-[#8A8A8A]">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" placeholder="John Smith" value={formData.fullName} onChange={(e) => update('fullName', e.target.value)} required data-testid="register-name-input" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="your@email.com" value={formData.email} onChange={(e) => update('email', e.target.value)} required data-testid="register-email-input" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input id="phone" type="tel" placeholder="+44 7xxx xxx xxx" value={formData.phone} onChange={(e) => update('phone', e.target.value)} data-testid="register-phone-input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Min 6 chars" value={formData.password} onChange={(e) => update('password', e.target.value)} required data-testid="register-password-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm</Label>
              <Input id="confirmPassword" type="password" placeholder="Confirm" value={formData.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} required data-testid="register-confirm-password-input" />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading} data-testid="register-submit-button">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</> : 'Create Account'}
          </Button>
        </form>
        <p className="text-sm text-center text-[#5C5C5C] mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#1A4331] font-medium hover:underline" data-testid="login-link">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative">
        <SiteImage
          imageKey="register_bg"
          variant={{ kind: 'fill' }}
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-[#1A4331]/50 flex items-center justify-center p-12">
          <div className="text-center text-white">
            <PawPrint className="h-16 w-16 mx-auto mb-6 opacity-90" />
            <h2 className="font-heading text-4xl font-bold mb-4">Join Rocky&apos;s Retreat and Rambles</h2>
            <p className="text-white/80 text-lg max-w-md">Whether you&apos;re a pet owner or a professional walker, we&apos;ve got you covered.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-[#F9F8F6]">
        <RegisterForm />
      </div>
    </div>
  )
}
