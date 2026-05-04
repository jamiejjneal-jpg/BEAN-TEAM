'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Star, Mail, Phone, MapPin, Plus, Pencil, Trash2, Camera, Loader2, DollarSign, X, UserCog, Search } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { changeUserRole, deleteUser, type Role } from '@/lib/admin-ops'
import { exportUserWalks } from '@/lib/exports'
import { logAudit } from '@/lib/audit'
import { triggerAutoEmail } from '@/lib/autoEmail'

export default function AdminWalkers() {
  const [walkers, setWalkers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [roleConfirm, setRoleConfirm] = useState<{ person: any; new_role: Role } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', address: '', password: '', bio: '', experience_years: '0', hourly_rate: '15', max_dogs: '3', service_area: '' })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { fetchWalkers() }, [])

  async function fetchWalkers() {
    const { data } = await supabase.from('profiles').select('*, walker_profiles(*)').eq('role', 'walker').order('created_at', { ascending: false })
    setWalkers(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm({ full_name: '', email: '', phone: '', address: '', password: '', bio: '', experience_years: '0', hourly_rate: '15', max_dogs: '3', service_area: '' })
    setEditingId(null)
    setPhotoFile(null); setPhotoPreview(null); setCurrentAvatar(null)
    setDialogOpen(true)
  }

  function openEdit(w: any) {
    setForm({
      full_name: w.full_name || '', email: w.email || '', phone: w.phone || '', address: w.address || '', password: '',
      bio: w.walker_profiles?.bio || '', experience_years: String(w.walker_profiles?.experience_years || 0),
      hourly_rate: String(w.walker_profiles?.hourly_rate || 15), max_dogs: String(w.walker_profiles?.max_dogs || 3),
      service_area: w.walker_profiles?.service_area || '',
    })
    setEditingId(w.id)
    setPhotoFile(null); setPhotoPreview(null); setCurrentAvatar(w.avatar_url || null)
    setDialogOpen(true)
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return }
    setPhotoFile(f)
    const r = new FileReader()
    r.onload = () => setPhotoPreview(r.result as string)
    r.readAsDataURL(f)
  }

  async function uploadPhoto(userId: string): Promise<string | null> {
    if (!photoFile) return null
    setUploading(true)
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `avatars/${userId}/profile.${ext}`
    const { error } = await supabase.storage.from('dog-photos').upload(path, photoFile, { cacheControl: '3600', upsert: true })
    setUploading(false)
    if (error) { toast.error('Photo upload failed: ' + error.message); return null }
    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(path)
    return urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null
  }

  async function handleSave() {
    if (!editingId) {
      // For new accounts, Supabase Auth requires email + password (minimum)
      if (!form.email.trim()) { toast.error('Email is required to create an account'); return }
      if (!form.password || form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    }

    if (editingId) {
      let avatarUrl: string | null = currentAvatar
      if (photoFile) {
        const u = await uploadPhoto(editingId)
        if (u) avatarUrl = u
      }
      const profilePayload: any = { full_name: form.full_name, phone: form.phone, address: form.address }
      if (avatarUrl !== null) profilePayload.avatar_url = avatarUrl
      const { data: p, error: pErr } = await supabase.from('profiles').update(profilePayload).eq('id', editingId).select('id')
      const { data: wp, error: wpErr } = await supabase.from('walker_profiles').update({
        bio: form.bio, experience_years: parseInt(form.experience_years) || 0,
        hourly_rate: parseFloat(form.hourly_rate) || 15, max_dogs: parseInt(form.max_dogs) || 3, service_area: form.service_area,
      }).eq('id', editingId).select('id')
      if (pErr || wpErr) { toast.error('Save failed: ' + (pErr?.message || wpErr?.message)); return }
      if ((p?.length ?? 0) === 0 || (wp?.length ?? 0) === 0) {
        toast.error('Save blocked — run the admin-write-policies SQL migration (see chat).')
        return
      }
      toast.success('Walker updated')
    } else {
      if (!form.password || form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.full_name, role: 'walker', phone: form.phone } }
      })
      if (error) { toast.error(error.message); return }
      if (data.user) {
        let avatarUrl: string | null = null
        if (photoFile) avatarUrl = await uploadPhoto(data.user.id)
        await supabase.from('profiles').upsert({
          id: data.user.id, email: form.email, full_name: form.full_name, role: 'walker',
          phone: form.phone, address: form.address,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        }, { onConflict: 'id' })
        await supabase.from('walker_profiles').upsert({ id: data.user.id, bio: form.bio, experience_years: parseInt(form.experience_years) || 0, hourly_rate: parseFloat(form.hourly_rate) || 15, max_dogs: parseInt(form.max_dogs) || 3, service_area: form.service_area }, { onConflict: 'id' })
        // Fire the welcome-walker automation (no-op if toggle off)
        triggerAutoEmail('welcome_walker', { email: form.email, full_name: form.full_name })
      }
      toast.success('Walker created')
    }
    setDialogOpen(false)
    fetchWalkers()
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    setBusyId(deleteConfirm.id)
    try {
      if (deleteConfirm.email) {
        await triggerAutoEmail('leaving_walker', { email: deleteConfirm.email, full_name: deleteConfirm.full_name })
      }
      await deleteUser(deleteConfirm.id)
      toast.success(`Deleted ${deleteConfirm.full_name || deleteConfirm.email}`)
      setDeleteConfirm(null)
      fetchWalkers()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRoleChange() {
    if (!roleConfirm) return
    setBusyId(roleConfirm.person.id)
    try {
      await changeUserRole(roleConfirm.person.id, roleConfirm.new_role)
      toast.success(`Role changed to ${roleConfirm.new_role}`)
      setRoleConfirm(null)
      fetchWalkers()
    } catch (e: any) {
      toast.error(e.message || 'Failed to change role')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleActive(w: any) {
    await supabase.from('profiles').update({ is_active: !w.is_active }).eq('id', w.id)
    toast.success(w.is_active ? 'Walker deactivated' : 'Walker activated')
    fetchWalkers()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="admin-walkers-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Manage Walkers</h1>
          <p className="text-[#5C5C5C] mt-1">{walkers.length} walker{walkers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
            <Input placeholder="Search name, email or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="walker-search" />
          </div>
          <Button onClick={openNew} data-testid="add-walker-button"><Plus className="h-4 w-4 mr-1" /> Add Walker</Button>
        </div>
      </div>

      {(() => {
        const q = search.trim().toLowerCase()
        const filtered = !q ? walkers : walkers.filter(w =>
          (w.full_name || '').toLowerCase().includes(q) ||
          (w.email || '').toLowerCase().includes(q) ||
          (w.phone || '').toLowerCase().includes(q) ||
          (w.address || '').toLowerCase().includes(q)
        )
        if (walkers.length === 0) {
          return <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No walkers yet</CardContent></Card>
        }
        if (filtered.length === 0) {
          return <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No walkers match &ldquo;{search}&rdquo;</CardContent></Card>
        }
        return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <Card key={w.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {w.avatar_url ? (
                      <img src={w.avatar_url} alt={w.full_name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-[#E8F0EC] flex items-center justify-center text-[#1A4331] font-bold text-sm">
                        {w.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'W'}
                      </div>
                    )}
                    <div>
                      <h3 className="font-heading font-semibold">{w.full_name || 'Unnamed'}</h3>
                      <p className="text-xs text-[#8A8A8A]">{w.email}</p>
                    </div>
                  </div>
                  <Badge variant={w.is_active ? 'success' : 'destructive'}>{w.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                {w.walker_profiles && (
                  <div className="space-y-1 text-sm text-[#5C5C5C] mb-4">
                    <div className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-[#DDA74F]" />{Number(w.walker_profiles.rating || 0).toFixed(1)} ({w.walker_profiles.total_reviews} reviews)</div>
                    <p>£{Number(w.walker_profiles.hourly_rate || 15).toFixed(2)}/hr | {w.walker_profiles.total_walks} walks</p>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openEdit(w)} data-testid={`edit-walker-${w.id}`}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                  <Link href={`/admin/walkers/payouts?id=${w.id}`}>
                    <Button size="sm" variant="outline" className="text-[#1A4331] border-[#1A4331]/30" data-testid={`payouts-walker-${w.id}`}>
                      <DollarSign className="h-3.5 w-3.5 mr-1" /> Payouts
                    </Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(w)}>{w.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Select value="walker" onValueChange={(v) => setRoleConfirm({ person: w, new_role: v as Role })} disabled={busyId === w.id}>
                    <SelectTrigger className="h-9 w-[120px] text-xs" data-testid={`change-role-walker-${w.id}`}>
                      <UserCog className="h-3.5 w-3.5 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walker">Walker</SelectItem>
                      <SelectItem value="admin">Make Admin</SelectItem>
                      <SelectItem value="client">Make Client</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="text-[#E06D53]" onClick={() => setDeleteConfirm(w)} disabled={busyId === w.id} data-testid={`delete-walker-${w.id}`}>
                    {busyId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )
      })()}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Walker' : 'Add New Walker'}</DialogTitle>
            <DialogDescription>{editingId ? 'Update walker details' : 'Create a new walker account'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-[#E5E3DB]">
              {photoPreview || currentAvatar ? (
                <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-[#E8F0EC]">
                  <img src={photoPreview || currentAvatar || ''} alt="preview" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setCurrentAvatar(null) }} className="absolute top-0 right-0 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="h-16 w-16 rounded-full border-2 border-dashed border-[#E5E3DB] flex flex-col items-center justify-center text-[#8A8A8A] hover:border-[#1A4331] hover:text-[#1A4331]">
                  <Camera className="h-5 w-5" />
                </button>
              )}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="admin-upload-walker-photo">
                  <Camera className="h-3.5 w-3.5 mr-1.5" /> {(photoPreview || currentAvatar) ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <p className="text-xs text-[#8A8A8A] mt-1">JPG / PNG / WebP. Max 5MB.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} data-testid="walker-name" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            {!editingId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Email <span className="text-[#E06D53]">*</span></Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Password <span className="text-[#E06D53]">*</span></Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 chars" required /></div>
              </div>
            )}
            <p className="text-xs text-[#8A8A8A] -mt-2">Only email and password are required to create the account — everything else is optional and can be added later.</p>
            <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-2"><Label>Bio</Label><Textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Experience (yrs)</Label><Input type="number" min={0} value={form.experience_years} onChange={e => setForm({ ...form, experience_years: e.target.value })} /></div>
              <div className="space-y-2"><Label>Hourly Rate (£)</Label><Input type="number" min={0} step={0.5} value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></div>
              <div className="space-y-2"><Label>Max Dogs</Label><Input type="number" min={1} max={10} value={form.max_dogs} onChange={e => setForm({ ...form, max_dogs: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Service Area</Label><Input value={form.service_area} onChange={e => setForm({ ...form, service_area: e.target.value })} placeholder="e.g. London SW" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={uploading} data-testid="save-walker">{uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</> : (editingId ? 'Update' : 'Create Walker')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[#E06D53]">Delete walker permanently?</DialogTitle>
            <DialogDescription>This permanently removes <strong>{deleteConfirm?.full_name || deleteConfirm?.email}</strong>, their login and profile. Past walk logs stay for auditing. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[#E5E3DB] bg-[#F9F8F6] p-3 text-sm text-[#3C3C3C]">
            <p className="font-medium text-[#1A4331] mb-1">💾 Keep a copy for your records</p>
            <p className="mb-2">Download every walk this walker performed as an Excel file before deleting.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busyId}
              onClick={async () => {
                try {
                  const label = deleteConfirm?.full_name || deleteConfirm?.email || 'walker'
                  const n = await exportUserWalks(deleteConfirm.id, label)
                  toast.success(n ? `Exported ${n} walk${n === 1 ? '' : 's'}` : 'No walks to export — file contains a note')
                } catch (e: any) { toast.error(e?.message || 'Export failed') }
              }}
              data-testid="export-walker-walks"
            >
              Export all walks (Excel)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={!!busyId}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!busyId} data-testid="confirm-delete-walker">
              {busyId ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</> : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change confirm */}
      <Dialog open={!!roleConfirm} onOpenChange={(open) => { if (!open) setRoleConfirm(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change role?</DialogTitle>
            <DialogDescription>
              {roleConfirm && (<>Change <strong>{roleConfirm.person.full_name || roleConfirm.person.email}</strong> from <strong>walker</strong> to <strong>{roleConfirm.new_role}</strong>?</>)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleConfirm(null)} disabled={!!busyId}>Cancel</Button>
            <Button onClick={confirmRoleChange} disabled={!!busyId} data-testid="confirm-role-change-walker">
              {busyId ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...</> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
