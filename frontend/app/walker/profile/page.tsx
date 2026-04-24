'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Save, Star, Camera, Loader2, X } from 'lucide-react'
import { ChangePasswordCard } from '@/components/shared/ChangePasswordCard'

export default function WalkerProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [walkerProfile, setWalkerProfile] = useState<any>(null)
  const [form, setForm] = useState({
    full_name: '', phone: '', address: '',
    bio: '', experience_years: 0, hourly_rate: 15, max_dogs: 3, service_area: '',
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
    const { data } = await supabase.from('walker_profiles').select('*').eq('id', user!.id).maybeSingle()
    setWalkerProfile(data)
    setForm({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      bio: data?.bio || '',
      experience_years: data?.experience_years || 0,
      hourly_rate: data?.hourly_rate || 15,
      max_dogs: data?.max_dogs || 3,
      service_area: data?.service_area || '',
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
    setSaving(true)

    let avatarUrl = profile?.avatar_url || null
    if (photoFile) {
      const uploaded = await uploadProfilePhoto()
      if (uploaded) avatarUrl = uploaded
    }

    await Promise.all([
      supabase.from('profiles').update({
        full_name: form.full_name,
        phone: form.phone,
        address: form.address,
        avatar_url: avatarUrl,
      }).eq('id', user!.id),
      supabase.from('walker_profiles').update({
        bio: form.bio,
        experience_years: form.experience_years,
        hourly_rate: form.hourly_rate,
        max_dogs: form.max_dogs,
        service_area: form.service_area,
      }).eq('id', user!.id),
    ])
    await refreshProfile()
    setPhotoFile(null)
    setPhotoPreview(null)
    toast.success('Profile updated')
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const currentPhoto = photoPreview || profile?.avatar_url

  return (
    <div className="space-y-6 max-w-2xl" data-testid="walker-profile-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-[#5C5C5C] mt-1">Manage your walker profile</p>
      </div>

      {walkerProfile && (
        <div className="flex items-center gap-4">
          <Badge variant="default" className="text-sm px-4 py-1">
            <Star className="h-3.5 w-3.5 mr-1 text-[#DDA74F]" />
            {Number(walkerProfile.rating || 0).toFixed(1)} ({walkerProfile.total_reviews} reviews)
          </Badge>
          <Badge variant="secondary" className="text-sm px-4 py-1">{walkerProfile.total_walks} walks</Badge>
        </div>
      )}

      {/* Profile Photo */}
      <Card>
        <CardHeader><CardTitle>Profile Photo</CardTitle></CardHeader>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="profile-name" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="profile-phone" /></div>
          </div>
          <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="profile-address" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Walker Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Tell clients about yourself..." data-testid="profile-bio" /></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Experience (years)</Label><Input type="number" min={0} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: parseInt(e.target.value) || 0 })} /></div>
            <div className="space-y-2"><Label>Hourly Rate (£)</Label><Input type="number" min={0} step={0.5} value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: parseFloat(e.target.value) || 0 })} /></div>
            <div className="space-y-2"><Label>Max Dogs</Label><Input type="number" min={1} max={10} value={form.max_dogs} onChange={(e) => setForm({ ...form, max_dogs: parseInt(e.target.value) || 1 })} /></div>
          </div>
          <div className="space-y-2"><Label>Service Area</Label><Input value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })} placeholder="e.g. London SW, Manchester City Centre" /></div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || uploadingPhoto} className="w-full" data-testid="save-profile-button">
        {saving || uploadingPhoto ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Profile</>}
      </Button>

      <ChangePasswordCard />
    </div>
  )
}
