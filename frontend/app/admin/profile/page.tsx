'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { Save, Camera, Loader2, X } from 'lucide-react'
import { ChangePasswordCard } from '@/components/shared/ChangePasswordCard'

function initialsFrom(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function AdminProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const supabase = createClient()
  const [form, setForm] = useState({ full_name: '', phone: '', address: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (user) fetchProfile() }, [user])

  async function fetchProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle()
    setForm({
      full_name: data?.full_name || '',
      phone: data?.phone || '',
      address: data?.address || '',
    })
    setCurrentPhoto(data?.avatar_url || null)
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

  async function uploadAvatar(): Promise<string | null> {
    if (!photoFile || !user) return currentPhoto
    setUploadingPhoto(true)
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `avatars/${user.id}.${ext}`
    const { error } = await supabase.storage.from('dog-photos').upload(path, photoFile, { cacheControl: '3600', upsert: true })
    setUploadingPhoto(false)
    if (error) { toast.error('Photo upload failed: ' + error.message); return currentPhoto }
    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(path)
    return urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const avatar_url = photoFile ? await uploadAvatar() : currentPhoto
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
      ...(avatar_url !== null ? { avatar_url } : {}),
    }).eq('id', user.id)
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success('Profile updated')
    setPhotoFile(null); setPhotoPreview(null)
    if (avatar_url) setCurrentPhoto(avatar_url)
    await refreshProfile()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const displayUrl = photoPreview || currentPhoto

  return (
    <div className="space-y-6 max-w-3xl" data-testid="admin-profile-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-[#5C5C5C] mt-1">Update your photo, contact details and password</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Photo &amp; Basic Info</CardTitle>
          <CardDescription>Shown on your dashboard, audit logs, and booking updates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 border-2 border-[#E5E3DB]">
                {displayUrl && <AvatarImage src={displayUrl} alt={form.full_name || 'avatar'} />}
                <AvatarFallback className="text-lg">{initialsFrom(form.full_name, user?.email)}</AvatarFallback>
              </Avatar>
              {displayUrl && (
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); setCurrentPhoto(null) }}
                  className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-white border border-[#E5E3DB] flex items-center justify-center text-[#5C5C5C] hover:bg-[#F2F0EB]"
                  aria-label="Remove photo"
                ><X className="h-3.5 w-3.5" /></button>
              )}
            </div>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="admin-upload-avatar">
                <Camera className="h-3.5 w-3.5 mr-1.5" /> {displayUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              <p className="text-xs text-[#8A8A8A] mt-1">JPG / PNG / WebP. Max 5MB.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ap-email">Email</Label>
              <Input id="ap-email" value={user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-name">Full name</Label>
              <Input id="ap-name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} data-testid="admin-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-phone">Phone</Label>
              <Input id="ap-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+44 7xxx xxx xxx" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ap-address">Address</Label>
              <Input id="ap-address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || uploadingPhoto} className="w-full" data-testid="admin-save-profile">
        {saving || uploadingPhoto ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save profile</>}
      </Button>

      <ChangePasswordCard />
    </div>
  )
}
