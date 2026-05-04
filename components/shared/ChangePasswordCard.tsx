'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react'

// Self-service password change. Supabase `updateUser` already requires a
// valid session, so the user is implicitly re-authenticated. We also
// verify the current password up-front via `signInWithPassword` so the
// user can't change the password on a stolen session.
export function ChangePasswordCard() {
  const { user } = useAuth()
  const supabase = createClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.email) return

    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (newPassword !== confirm) { toast.error('New passwords don\'t match'); return }
    if (newPassword === currentPassword) { toast.error('Please choose a new password different from your current one'); return }

    setSaving(true)
    // Verify current password.
    const { error: sigErr } = await supabase.auth.signInWithPassword({
      email: user.email, password: currentPassword,
    })
    if (sigErr) { setSaving(false); toast.error('Current password is incorrect'); return }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) { toast.error('Could not update password: ' + error.message); return }

    toast.success('Password updated successfully')
    setCurrentPassword(''); setNewPassword(''); setConfirm('')
  }

  return (
    <Card data-testid="change-password-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-[#1A4331]" /> Change Password</CardTitle>
        <CardDescription>Use at least 8 characters. Keep it private — never share it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current password</Label>
            <div className="relative">
              <Input
                id="cp-current"
                type={show ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                data-testid="cp-current"
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#1A1A1A]"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">New password</Label>
            <Input
              id="cp-new"
              type={show ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-testid="cp-new"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-testid="cp-confirm"
            />
          </div>
          <Button type="submit" disabled={saving || !currentPassword || !newPassword || !confirm} data-testid="cp-submit">
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Updating…</> : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
