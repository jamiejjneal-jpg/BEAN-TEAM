'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Mail, Phone, Dog, Plus, Pencil, Trash2, Key, AlertTriangle, Camera, X, Loader2, UserCog, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { changeUserRole, deleteUser, type Role } from '@/lib/admin-ops'
import { exportUserWalks } from '@/lib/exports'
import { triggerAutoEmail } from '@/lib/autoEmail'

export default function AdminClients() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [roleConfirm, setRoleConfirm] = useState<{ person: any; new_role: Role } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [clientDogs, setClientDogs] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', address: '', password: '',
    key_code: '', key_location: '',
    emergency_contact: '', emergency_phone: '',
  })
  const supabase = createClient()

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm({
      full_name: '', email: '', phone: '', address: '', password: '',
      key_code: '', key_location: '',
      emergency_contact: '', emergency_phone: '',
    })
    setEditingId(null)
    setPhotoFile(null); setPhotoPreview(null); setCurrentAvatar(null)
    setDialogOpen(true)
  }

  function openEdit(c: any) {
    setForm({
      full_name: c.full_name || '', email: c.email, phone: c.phone || '', address: c.address || '', password: '',
      key_code: c.key_code || '', key_location: c.key_location || '',
      emergency_contact: c.emergency_contact || '', emergency_phone: c.emergency_phone || '',
    })
    setEditingId(c.id)
    setPhotoFile(null); setPhotoPreview(null); setCurrentAvatar(c.avatar_url || null)
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

  async function viewDogs(c: any) {
    setSelectedClient(c)
    const { data } = await supabase.from('dogs').select('*').eq('owner_id', c.id)
    setClientDogs(data || [])
  }

  async function handleSave() {
    if (!editingId) {
      // Supabase Auth requires email + password to create an account; all other
      // fields are optional when admins add a client (they can fill them in later).
      if (!form.email.trim()) { toast.error('Email is required to create a client account'); return }
      if (!form.password || form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    }
    if (editingId) {
      let avatarUrl: string | null = currentAvatar
      if (photoFile) {
        const u = await uploadPhoto(editingId)
        if (u) avatarUrl = u
      }
      const updatePayload: any = {
        full_name: form.full_name, phone: form.phone, address: form.address,
        key_code: form.key_code, key_location: form.key_location,
        emergency_contact: form.emergency_contact, emergency_phone: form.emergency_phone,
      }
      if (avatarUrl !== null) updatePayload.avatar_url = avatarUrl
      await supabase.from('profiles').update(updatePayload).eq('id', editingId)
      logAudit({ action: 'client_updated', target_type: 'user', target_id: editingId, target_name: form.full_name || form.email })
      toast.success('Client updated')
    } else {
      if (!form.password || form.password.length < 6) { toast.error('Password min 6 characters'); return }
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.full_name, role: 'client', phone: form.phone } }
      })
      if (error) { toast.error(error.message); return }
      if (data.user) {
        let avatarUrl: string | null = null
        if (photoFile) avatarUrl = await uploadPhoto(data.user.id)
        await supabase.from('profiles').upsert({
          id: data.user.id, email: form.email, full_name: form.full_name, role: 'client',
          phone: form.phone, address: form.address,
          key_code: form.key_code, key_location: form.key_location,
          emergency_contact: form.emergency_contact, emergency_phone: form.emergency_phone,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        }, { onConflict: 'id' })
        logAudit({ action: 'client_added', target_type: 'user', target_id: data.user.id, target_name: form.full_name || form.email, details: { email: form.email } })
        // Fire the welcome email automation (no-op if admin hasn't enabled it)
        triggerAutoEmail('welcome_client', { email: form.email, full_name: form.full_name })
      }
      toast.success('Client created')
    }
    setDialogOpen(false)
    fetchClients()
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    setBusyId(deleteConfirm.id)
    try {
      // Send farewell email BEFORE deletion (email must go before the auth user vanishes).
      if (deleteConfirm.email) {
        await triggerAutoEmail('leaving_client', { email: deleteConfirm.email, full_name: deleteConfirm.full_name })
      }
      await deleteUser(deleteConfirm.id)
      toast.success(`Deleted ${deleteConfirm.full_name || deleteConfirm.email}`)
      setDeleteConfirm(null)
      fetchClients()
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
      fetchClients()
    } catch (e: any) {
      toast.error(e.message || 'Failed to change role')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="admin-clients-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Manage Clients</h1>
          <p className="text-[#5C5C5C] mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
            <Input placeholder="Search name, email or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="client-search" />
          </div>
          <Button onClick={openNew} data-testid="add-client-button"><Plus className="h-4 w-4 mr-1" /> Add Client</Button>
        </div>
      </div>

      {(() => {
        const q = search.trim().toLowerCase()
        const filtered = !q ? clients : clients.filter((c: any) =>
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.address || '').toLowerCase().includes(q)
        )
        if (clients.length === 0) {
          return <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No clients yet</CardContent></Card>
        }
        if (filtered.length === 0) {
          return <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No clients match &ldquo;{search}&rdquo;</CardContent></Card>
        }
        return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt={c.full_name} className="h-10 w-10 rounded-full object-cover border-2 border-[#E8F0EC]" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-[#E8F0EC] flex items-center justify-center text-[#1A4331] font-bold text-xs">
                        {(c.full_name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-heading font-semibold">{c.full_name || 'Unnamed'}</h3>
                      <p className="text-xs text-[#8A8A8A]">{c.email}</p>
                    </div>
                  </div>
                  <Badge variant={c.is_active ? 'success' : 'destructive'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                {c.phone && <p className="text-sm text-[#5C5C5C] flex items-center gap-1.5 mb-1"><Phone className="h-3.5 w-3.5" />{c.phone}</p>}
                {c.address && <p className="text-xs text-[#8A8A8A] mb-2 line-clamp-2">📍 {c.address}</p>}
                <div className="flex flex-wrap gap-1 mb-3">
                  {c.key_code && <Badge variant="info" className="text-[10px]"><Key className="h-2.5 w-2.5 mr-1" /> Keycode</Badge>}
                  {c.emergency_contact && <Badge variant="default" className="text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-1" /> Emergency</Badge>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => viewDogs(c)}><Dog className="h-3.5 w-3.5 mr-1" /> Dogs</Button>
                  <Select value="client" onValueChange={(v) => setRoleConfirm({ person: c, new_role: v as Role })} disabled={busyId === c.id}>
                    <SelectTrigger className="h-9 w-[120px] text-xs" data-testid={`change-role-client-${c.id}`}>
                      <UserCog className="h-3.5 w-3.5 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="admin">Make Admin</SelectItem>
                      <SelectItem value="walker">Make Walker</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="text-[#E06D53]" onClick={() => setDeleteConfirm(c)} disabled={busyId === c.id} data-testid={`delete-client-${c.id}`}>
                    {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )
      })()}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Client' : 'Add New Client'}</DialogTitle></DialogHeader>
          <div className="space-y-5">
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
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="admin-upload-client-photo">
                  <Camera className="h-3.5 w-3.5 mr-1.5" /> {(photoPreview || currentAvatar) ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <p className="text-xs text-[#8A8A8A] mt-1">JPG / PNG / WebP. Max 5MB.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
            </div>

            <div>
              <p className="text-xs font-semibold text-[#8A8A8A] uppercase tracking-wide mb-2">Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              {!editingId && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-2"><Label>Email <span className="text-[#E06D53]">*</span></Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Password <span className="text-[#E06D53]">*</span></Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 chars" required /></div>
                </div>
              )}
              <div className="space-y-2 mt-3"><Label>Home Address</Label><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Pickup / dropoff address (optional — client can add later)" /></div>
              <p className="text-xs text-[#8A8A8A] mt-2">Only email and password are required to create the account. Everything else can be filled in later by the client or you.</p>
            </div>

            <div className="border-t border-[#E5E3DB] pt-4">
              <p className="text-xs font-semibold text-[#DDA74F] uppercase tracking-wide mb-2 flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Property Access (optional)</p>
              <div className="space-y-3">
                <div className="space-y-2"><Label>Keycode / Lockbox Code</Label><Input value={form.key_code} onChange={e => setForm({ ...form, key_code: e.target.value })} placeholder="e.g. 4821" /></div>
                <div className="space-y-2"><Label>Access Instructions / Key Location</Label><Textarea value={form.key_location} onChange={e => setForm({ ...form, key_location: e.target.value })} placeholder="Where is the lockbox? Alarm code? Leash location?" /></div>
              </div>
            </div>

            <div className="border-t border-[#E5E3DB] pt-4">
              <p className="text-xs font-semibold text-[#E06D53] uppercase tracking-wide mb-2 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Emergency Contact (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Contact Name</Label><Input value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} /></div>
                <div className="space-y-2"><Label>Contact Phone</Label><Input value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} placeholder="+44 7xxx xxx xxx" /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={uploading}>{uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</> : (editingId ? 'Update' : 'Create Client')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dogs dialog */}
      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedClient?.full_name}&apos;s Dogs</DialogTitle></DialogHeader>
          {clientDogs.length === 0 ? (
            <p className="text-sm text-[#8A8A8A] py-4 text-center">No dogs registered</p>
          ) : (
            <div className="space-y-2">
              {clientDogs.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-[#F9F8F6] rounded-lg">
                  <div className="flex items-center gap-3">
                    {d.photo_url ? <img src={d.photo_url} alt={d.name} className="h-10 w-10 rounded-full object-cover" /> : <Dog className="h-5 w-5 text-[#8EA396]" />}
                    <div><p className="font-medium text-sm">{d.name}</p><p className="text-xs text-[#8A8A8A]">{d.breed} | {d.size}</p></div>
                  </div>
                  <Badge variant={d.is_active ? 'default' : 'destructive'}>{d.is_active ? 'Active' : 'Removed'}</Badge>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[#E06D53]">Delete client permanently?</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{deleteConfirm?.full_name || deleteConfirm?.email}</strong>, their login, profile, and any dogs they own. Past walk logs stay for auditing. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[#E5E3DB] bg-[#F9F8F6] p-3 text-sm text-[#3C3C3C]">
            <p className="font-medium text-[#1A4331] mb-1">💾 Keep a copy for your records</p>
            <p className="mb-2">Download every walk this client booked as an Excel file before deleting — useful for GDPR / data-retention requests.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busyId}
              onClick={async () => {
                try {
                  const label = deleteConfirm?.full_name || deleteConfirm?.email || 'client'
                  const n = await exportUserWalks(deleteConfirm.id, label)
                  toast.success(n ? `Exported ${n} walk${n === 1 ? '' : 's'}` : 'No walks to export — file contains a note')
                } catch (e: any) { toast.error(e?.message || 'Export failed') }
              }}
              data-testid="export-client-walks"
            >
              Export all walks (Excel)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={!!busyId}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!busyId} data-testid="confirm-delete-client">
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
              {roleConfirm && (<>Change <strong>{roleConfirm.person.full_name || roleConfirm.person.email}</strong> from <strong>client</strong> to <strong>{roleConfirm.new_role}</strong>?</>)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleConfirm(null)} disabled={!!busyId}>Cancel</Button>
            <Button onClick={confirmRoleChange} disabled={!!busyId} data-testid="confirm-role-change-client">
              {busyId ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...</> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
