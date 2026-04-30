'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Save, Camera, Loader2, X, Key, Phone, User, AlertCircle } from 'lucide-react'
import { ChangePasswordCard } from '@/components/shared/ChangePasswordCard'
import { CalendarSubscriptionCard } from '@/components/shared/CalendarSubscriptionCard'

export default function ClientProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    full_name: '', phone: '', address: '',
    key_code: '', key_location: '',
    emergency_contact: '', emergency_phone: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { if (user) fetchProfile() }, [user])

  async function fetchProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle()
    setForm({
      full_name: data?.full_name || '',
      phone: data?.phone || '',
      address: data?.address || '',
      key_code: data?.key_code || '',
      key_location: data?.key_location || '',
      emergency_contact: data?.emergency_contact || '',
      emergency_phone: data?.emergency_phone || '',
    })
    setLoading(false)
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadProfilePhoto(): Promise<string | null> {
    if (!photoFile || !user) return null
    setUploadingPhoto(true)
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `avatars/${user.id}/profile.${ext}`
    const { error } = await supabase.storage
      .from('dog-photos')
      .upload(filePath, photoFile, { cacheControl: '3600', upsert: true })
    setUploadingPhoto(false)
    if (error) { toast.error('Photo upload failed'); return null }
    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(filePath)
    return urlData?.publicUrl || null
  }

  async function handleSave() {
    // Required-field validation
    const missing: string[] = []
    if (!form.full_name.trim()) missing.push('Full name')
    if (!form.phone.trim()) missing.push('Phone number')
    if (!form.address.trim()) missing.push('Home address')
    if (!form.emergency_contact.trim()) missing.push('Emergency contact name')
    if (!form.emergency_phone.trim()) missing.push('Emergency contact phone')
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.join(', ')}`)
      return
    }

    setSaving(true)
    let avatarUrl = profile?.avatar_url || null
    if (photoFile) {
      const uploaded = await uploadProfilePhoto()
      if (uploaded) avatarUrl = uploaded
    }

    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
      key_code: form.key_code,
      key_location: form.key_location,
      emergency_contact: form.emergency_contact,
      emergency_phone: form.emergency_phone,
      avatar_url: avatarUrl,
    }).eq('id', user!.id)

    setSaving(false)
    if (error) { toast.error('Failed to save: ' + error.message); return }
    await refreshProfile()
    setPhotoFile(null); setPhotoPreview(null)
    toast.success('Profile updated')
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const currentPhoto = photoPreview || profile?.avatar_url
  const missingRequired: string[] = []
  if (!form.full_name.trim()) missingRequired.push('Full name')
  if (!form.phone.trim()) missingRequired.push('Phone number')
  if (!form.address.trim()) missingRequired.push('Home address')
  if (!form.emergency_contact.trim()) missingRequired.push('Emergency contact')
  if (!form.emergency_phone.trim()) missingRequired.push('Emergency phone')
  const req = <span className="text-[#E06D53] ml-0.5">*</span>

  return (
    <div className="space-y-6 max-w-2xl" data-testid="client-profile-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-[#5C5C5C] mt-1">Your details shared with walkers during pickup</p>
      </div>

      {missingRequired.length > 0 && (
        <Card className="border-[#E06D53]/40 bg-[#FDEDEA]" data-testid="profile-incomplete-banner">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#E06D53] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-[#1A1A1A]">Please complete your profile</p>
              <p className="text-[#5C5C5C] mt-0.5">Missing: <strong className="text-[#E06D53]">{missingRequired.join(', ')}</strong>. Walkers need these details to safely look after your pet.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-[#8EA396]" /> Profile Photo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {currentPhoto ? (
              <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-[#E8F0EC]">
                <img src={currentPhoto} alt="Profile" className="w-full h-full object-cover" />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  className="absolute top-0 right-0 h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-black/70">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                className="h-24 w-24 rounded-full border-2 border-dashed border-[#E5E3DB] flex flex-col items-center justify-center text-[#8A8A8A] hover:border-[#1A4331] hover:text-[#1A4331] transition-colors">
                <Camera className="h-6 w-6 mb-1" />
                <span className="text-[10px]">Add Photo</span>
              </button>
            )}
            <div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} data-testid="upload-profile-photo">
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                {currentPhoto ? 'Change Photo' : 'Upload Photo'}
              </Button>
              <p className="text-xs text-[#8A8A8A] mt-1">JPG, PNG or WebP. Max 5MB.</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Full Name{req}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="profile-name" required /></div>
          <div className="space-y-2"><Label>Phone Number{req}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="profile-phone" placeholder="+44 7xxx xxx xxx" required /></div>
          <div className="space-y-2"><Label>Home Address{req}</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="profile-address" placeholder="Where the walker will pick up / drop off your pet" required /></div>
        </CardContent>
      </Card>

      <Card className="border-[#DDA74F]/30 bg-[#FDF8EF]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-[#DDA74F]" /> Property Access</CardTitle>
          <CardDescription>Only shared with walkers assigned to your bookings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Keycode / Lockbox Code</Label>
            <Input value={form.key_code} onChange={(e) => setForm({ ...form, key_code: e.target.value })} data-testid="profile-keycode" placeholder="e.g. 4821 or C2-3-1-5" />
          </div>
          <div className="space-y-2">
            <Label>Access Instructions / Key Location</Label>
            <Textarea value={form.key_location} onChange={(e) => setForm({ ...form, key_location: e.target.value })} data-testid="profile-access-notes" placeholder="Where is the lockbox? Where is the leash? Any alarm code? Side gate details..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-[#E06D53]" /> Emergency Contact</CardTitle>
          <CardDescription>Used if we can&apos;t reach you during a walk</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Contact Name{req}</Label><Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} data-testid="emergency-contact-name" required /></div>
          <div className="space-y-2"><Label>Contact Phone{req}</Label><Input value={form.emergency_phone} onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })} data-testid="emergency-contact-phone" placeholder="+44 7xxx xxx xxx" required /></div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || uploadingPhoto} className="w-full" data-testid="save-profile-button">
        {saving || uploadingPhoto ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Profile</>}
      </Button>

      <CalendarSubscriptionCard />

      <ChangePasswordCard />
    </div>
  )
}
