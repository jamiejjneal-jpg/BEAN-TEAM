'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DOG_SIZES } from '@/lib/utils'
import { PET_SPECIES, SPECIES_FIELDS, speciesConfig, type PetSpecies } from '@/lib/species'
import { Pencil, Trash2, Search, Camera, X, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { logAudit } from '@/lib/audit'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm">
      <div className={`h-5 w-9 rounded-full transition-colors flex items-center px-0.5 ${checked ? 'bg-[#1A4331]' : 'bg-[#E5E3DB]'}`}>
        <div className={`h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-[#5C5C5C]">{label}</span>
    </button>
  )
}

const emptyPet = {
  species: 'dog' as PetSpecies,
  name: '', breed: '', age: '', weight: '', size: 'medium', special_notes: '', medical_info: '',
  off_lead: false, vet_name: '', vet_phone: '', vet_address: '', vaccinations_up_to_date: false,
  vaccination_details: '', food_type: '', food_schedule: '', allergies: '',
  neutered: false, microchipped: false, microchip_number: '', emergency_contact: '', emergency_phone: '',
  temperament: '', good_with_dogs: true, good_with_children: true,
  details: {} as Record<string, any>,
}

function SpeciesPicker({ value, onChange }: { value: PetSpecies; onChange: (v: PetSpecies) => void }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {PET_SPECIES.map(s => {
        const Icon = s.icon
        const selected = value === s.value
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            data-testid={`species-${s.value}`}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${selected ? 'border-[#1A4331] bg-[#E8F0EC] text-[#1A4331]' : 'border-[#E5E3DB] text-[#5C5C5C] hover:border-[#1A4331]/40'}`}
          >
            <Icon className="h-5 w-5" />
            <span className="font-medium leading-tight text-center">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function SpeciesExtrasForm({ species, details, onChange }: { species: PetSpecies; details: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const fields = SPECIES_FIELDS[species] || []
  if (fields.length === 0) return null
  return (
    <div className="space-y-3">
      {fields.map(f => {
        const v = details?.[f.key]
        const update = (val: any) => onChange({ ...(details || {}), [f.key]: val })
        if (f.kind === 'toggle') {
          return <Toggle key={f.key} checked={!!v} onChange={update} label={f.label} />
        }
        if (f.kind === 'select') {
          return (
            <div key={f.key} className="space-y-2">
              <Label>{f.label}</Label>
              <Select value={v || ''} onValueChange={update}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{f.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )
        }
        return (
          <div key={f.key} className="space-y-2">
            <Label>{f.label}{f.unit ? ` (${f.unit})` : ''}</Label>
            <Input
              type={f.kind === 'number' ? 'number' : 'text'}
              value={v ?? ''}
              placeholder={f.placeholder || ''}
              onChange={e => update(f.kind === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function AdminPets() {
  const [pets, setPets] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState<PetSpecies | 'all'>('all')
  const [editPet, setEditPet] = useState<any>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newOwnerId, setNewOwnerId] = useState('')
  const [newForm, setNewForm] = useState(emptyPet)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [form, setForm] = useState(emptyPet)
  const [tab, setTab] = useState<'basic' | 'species' | 'health' | 'vet' | 'behaviour'>('basic')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { fetchPets(); fetchClients() }, [])

  async function fetchClients() {
    const { data } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'client').eq('is_active', true).order('full_name')
    setClients(data || [])
  }

  async function fetchPets() {
    const { data } = await supabase.from('dogs').select('*, owner:profiles!dogs_owner_id_fkey(full_name, email, phone, key_code, key_location, emergency_contact, emergency_phone)').order('created_at', { ascending: false })
    setPets(data || [])
    setLoading(false)
  }

  async function handleAddPet() {
    if (!newOwnerId) { toast.error('Please choose an owner'); return }
    if (!newForm.name.trim()) { toast.error('Please enter a name'); return }
    setSaving(true)
    const { data: inserted, error } = await supabase.from('dogs').insert({
      owner_id: newOwnerId,
      species: newForm.species,
      name: newForm.name, breed: newForm.breed,
      age: newForm.age ? parseInt(newForm.age) : null,
      weight: newForm.weight ? parseFloat(newForm.weight) : null,
      size: newForm.size, special_notes: newForm.special_notes,
      details: newForm.details || {},
      is_active: true,
    }).select('id').single()
    setSaving(false)
    if (error) { toast.error('Failed to add pet: ' + error.message); return }
    logAudit({ action: 'pet_added', target_type: 'pet', target_id: inserted?.id || null, target_name: newForm.name, details: { owner_id: newOwnerId, species: newForm.species } })
    toast.success(`${newForm.name} added`)
    setAddOpen(false); setNewForm(emptyPet); setNewOwnerId('')
    fetchPets()
  }

  function openEdit(p: any) {
    setForm({
      species: (p.species || 'dog') as PetSpecies,
      name: p.name || '', breed: p.breed || '', age: p.age?.toString() || '', weight: p.weight?.toString() || '',
      size: p.size || 'medium', special_notes: p.special_notes || '', medical_info: p.medical_info || '',
      off_lead: p.off_lead || false, vet_name: p.vet_name || '', vet_phone: p.vet_phone || '',
      vet_address: p.vet_address || '', vaccinations_up_to_date: p.vaccinations_up_to_date || false,
      vaccination_details: p.vaccination_details || '', food_type: p.food_type || '',
      food_schedule: p.food_schedule || '', allergies: p.allergies || '',
      neutered: p.neutered || false, microchipped: p.microchipped || false,
      microchip_number: p.microchip_number || '', emergency_contact: p.emergency_contact || '',
      emergency_phone: p.emergency_phone || '', temperament: p.temperament || '',
      good_with_dogs: p.good_with_dogs ?? true, good_with_children: p.good_with_children ?? true,
      details: p.details || {},
    })
    setTab('basic')
    setPhotoFile(null); setPhotoPreview(null); setCurrentPhoto(p.photo_url || null)
    setEditPet(p)
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

  async function uploadPhoto(petId: string): Promise<string | null> {
    if (!photoFile) return null
    setUploading(true)
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `pets/${petId}/profile.${ext}`
    const { error } = await supabase.storage.from('dog-photos').upload(path, photoFile, { cacheControl: '3600', upsert: true })
    setUploading(false)
    if (error) { toast.error('Photo upload failed: ' + error.message); return null }
    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(path)
    return urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null
  }

  async function handleSave() {
    if (!editPet) return
    if (!form.name.trim()) { toast.error('Please enter a name'); setTab('basic'); return }
    const payload: any = {
      species: form.species,
      name: form.name, breed: form.breed, age: form.age ? parseInt(form.age) : null,
      weight: form.weight ? parseFloat(form.weight) : null, size: form.size,
      special_notes: form.special_notes, medical_info: form.medical_info,
      off_lead: form.off_lead, vet_name: form.vet_name, vet_phone: form.vet_phone, vet_address: form.vet_address,
      vaccinations_up_to_date: form.vaccinations_up_to_date, vaccination_details: form.vaccination_details,
      food_type: form.food_type, food_schedule: form.food_schedule, allergies: form.allergies,
      neutered: form.neutered, microchipped: form.microchipped, microchip_number: form.microchip_number,
      emergency_contact: form.emergency_contact, emergency_phone: form.emergency_phone,
      temperament: form.temperament, good_with_dogs: form.good_with_dogs, good_with_children: form.good_with_children,
      details: form.details || {},
    }

    if (photoFile) {
      const url = await uploadPhoto(editPet.id)
      if (url) payload.photo_url = url
    } else if (currentPhoto === null && editPet.photo_url) {
      payload.photo_url = null
    }

    const { data: updated, error } = await supabase.from('dogs').update(payload).eq('id', editPet.id).select('id')
    if (error) { toast.error('Failed to update: ' + error.message); return }
    if (!updated || updated.length === 0) {
      toast.error('Save blocked — run the admin-write-policies SQL migration (see chat) or refresh your session.')
      return
    }
    logAudit({ action: 'pet_updated', target_type: 'pet', target_id: editPet.id, target_name: form.name })
    toast.success('Pet updated')
    setEditPet(null)
    fetchPets()
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    await supabase.from('dogs').update({ is_active: false }).eq('id', deleteConfirm.id)
    logAudit({ action: 'pet_deactivated', target_type: 'pet', target_id: deleteConfirm.id, target_name: deleteConfirm.name })
    toast.success('Pet removed')
    setDeleteConfirm(null)
    fetchPets()
  }

  async function toggleActive(p: any) {
    await supabase.from('dogs').update({ is_active: !p.is_active }).eq('id', p.id)
    toast.success(p.is_active ? 'Pet deactivated' : 'Pet reactivated')
    fetchPets()
  }

  const filtered = pets.filter(p => {
    const q = search.toLowerCase()
    if (speciesFilter !== 'all' && p.species !== speciesFilter) return false
    return !q || p.name?.toLowerCase().includes(q) || p.breed?.toLowerCase().includes(q) || p.owner?.full_name?.toLowerCase().includes(q)
  })

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const isDog = form.species === 'dog'
  const extraCount = (SPECIES_FIELDS[form.species] || []).length
  const tabs = [
    { key: 'basic' as const, label: 'Basic Info' },
    ...(extraCount > 0 ? [{ key: 'species' as const, label: `${speciesConfig(form.species).label} details` }] : []),
    { key: 'health' as const, label: 'Health & Food' },
    { key: 'vet' as const, label: 'Vet & Emergency' },
    { key: 'behaviour' as const, label: 'Behaviour' },
  ]

  return (
    <div className="space-y-6" data-testid="admin-pets-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Manage Pets</h1>
          <p className="text-[#5C5C5C] mt-1">{pets.length} pet{pets.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={speciesFilter} onValueChange={(v: any) => setSpeciesFilter(v)}>
            <SelectTrigger className="w-32" data-testid="species-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All species</SelectItem>
              {PET_SPECIES.map(s => <SelectItem key={s.value} value={s.value}>{s.pluralLabel}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
            <Input placeholder="Search pets or owners..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="pet-search" />
          </div>
          <Button onClick={() => { setNewForm(emptyPet); setNewOwnerId(''); setAddOpen(true) }} data-testid="add-pet-button">
            <Plus className="h-4 w-4 mr-1.5" /> Add Pet
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-[#8A8A8A]">{search || speciesFilter !== 'all' ? 'No pets match your filters' : 'No pets registered'}</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => {
            const cfg = speciesConfig(p.species as PetSpecies)
            const Icon = cfg.icon
            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow overflow-hidden">
                {p.photo_url && <div className="h-32 w-full overflow-hidden"><img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" /></div>}
                <CardContent className={p.photo_url ? 'p-4' : 'p-6'}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {!p.photo_url && <Icon className="h-5 w-5 text-[#8EA396]" />}
                      <div>
                        <h3 className="font-heading font-semibold">{p.name}</h3>
                        <p className="text-xs text-[#5C5C5C]">{p.breed || cfg.label}{p.species === 'dog' ? ` | ${p.size}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="text-[10px]">{cfg.label}</Badge>
                      <Badge variant={p.is_active ? 'default' : 'destructive'} className="text-[10px]">{p.is_active ? 'Active' : 'Removed'}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-[#8A8A8A] mb-2">Owner: {p.owner?.full_name || 'Unknown'} ({p.owner?.email})</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.species === 'dog' && p.off_lead && <Badge variant="success" className="text-[10px]">Off Lead</Badge>}
                    {p.vaccinations_up_to_date && <Badge variant="info" className="text-[10px]">Vaccinated</Badge>}
                    {p.neutered && <Badge variant="secondary" className="text-[10px]">Neutered</Badge>}
                    {p.microchipped && <Badge variant="secondary" className="text-[10px]">Chipped</Badge>}
                  </div>
                  {p.special_notes && <p className="text-xs text-[#E06D53] mb-2 line-clamp-2">Notes: {p.special_notes}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleActive(p)}>{p.is_active ? 'Deactivate' : 'Reactivate'}</Button>
                    <Button size="sm" variant="ghost" className="text-[#E06D53]" onClick={() => setDeleteConfirm(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editPet} onOpenChange={(open) => { if (!open) setEditPet(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit {editPet?.name}</DialogTitle></DialogHeader>

          {editPet?.owner && (
            <div className="rounded-lg bg-[#F9F8F6] border border-[#E5E3DB] p-3 text-sm space-y-1 -mt-2">
              <p className="text-xs font-semibold text-[#8A8A8A] uppercase tracking-wide mb-1">Owner</p>
              <p><strong>{editPet.owner.full_name}</strong> · {editPet.owner.email}{editPet.owner.phone ? ` · ${editPet.owner.phone}` : ''}</p>
              {editPet.owner.key_code && <p className="text-xs text-[#DDA74F]">🔑 Keycode: {editPet.owner.key_code}{editPet.owner.key_location ? ` — ${editPet.owner.key_location}` : ''}</p>}
              {editPet.owner.emergency_contact && <p className="text-xs text-[#E06D53]">Emergency: {editPet.owner.emergency_contact}{editPet.owner.emergency_phone ? ` (${editPet.owner.emergency_phone})` : ''}</p>}
            </div>
          )}

          {/* Species picker */}
          <div className="space-y-2 pb-4 border-b border-[#E5E3DB]">
            <Label>Species</Label>
            <SpeciesPicker value={form.species} onChange={(v) => setForm({ ...form, species: v })} />
          </div>

          {/* Photo */}
          <div className="flex items-center gap-4 pb-4 border-b border-[#E5E3DB]">
            {photoPreview || currentPhoto ? (
              <div className="relative h-20 w-20 rounded-lg overflow-hidden border-2 border-[#E8F0EC]">
                <img src={photoPreview || currentPhoto || ''} alt="preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setCurrentPhoto(null) }} className="absolute top-0 right-0 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="h-20 w-20 rounded-lg border-2 border-dashed border-[#E5E3DB] flex flex-col items-center justify-center text-[#8A8A8A] hover:border-[#1A4331] hover:text-[#1A4331]">
                <Camera className="h-6 w-6" />
              </button>
            )}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="admin-upload-pet-photo">
                <Camera className="h-3.5 w-3.5 mr-1.5" /> {(photoPreview || currentPhoto) ? 'Change Photo' : 'Upload Photo'}
              </Button>
              <p className="text-xs text-[#8A8A8A] mt-1">JPG / PNG / WebP. Max 5MB.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
          </div>

          <div className="flex gap-1 bg-[#F2F0EB] rounded-lg p-1 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`flex-1 whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === t.key ? 'bg-white text-[#1A4331] shadow-sm' : 'text-[#5C5C5C] hover:text-[#1A1A1A]'}`}>{t.label}</button>
            ))}
          </div>

          <div className="space-y-4 min-h-[200px]">
            {tab === 'basic' && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Name <span className="text-[#E06D53]">*</span></Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>{isDog ? 'Breed' : 'Breed / type'}</Label><Input value={form.breed} onChange={e => setForm({ ...form, breed: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Age (yrs)</Label><Input type="number" min={0} value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} /></div>
                {form.species !== 'fish' && <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" min={0} step={0.1} value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} /></div>}
                {isDog && <div className="space-y-2"><Label>Size</Label><Select value={form.size} onValueChange={v => setForm({ ...form, size: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOG_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>}
              </div>
              <div className="space-y-2"><Label>Special Notes</Label><Textarea value={form.special_notes} onChange={e => setForm({ ...form, special_notes: e.target.value })} placeholder="Any important notes..." /></div>
            </>)}

            {tab === 'species' && extraCount > 0 && (
              <SpeciesExtrasForm species={form.species} details={form.details} onChange={(d) => setForm({ ...form, details: d })} />
            )}

            {tab === 'health' && (<>
              <div className="grid grid-cols-2 gap-4">
                <Toggle checked={form.vaccinations_up_to_date} onChange={v => setForm({ ...form, vaccinations_up_to_date: v })} label="Vaccinations Up to Date" />
                <Toggle checked={form.neutered} onChange={v => setForm({ ...form, neutered: v })} label="Neutered / Spayed" />
                <Toggle checked={form.microchipped} onChange={v => setForm({ ...form, microchipped: v })} label="Microchipped" />
              </div>
              {form.microchipped && <div className="space-y-2"><Label>Microchip Number</Label><Input value={form.microchip_number} onChange={e => setForm({ ...form, microchip_number: e.target.value })} /></div>}
              <div className="space-y-2"><Label>Vaccination Details</Label><Textarea value={form.vaccination_details} onChange={e => setForm({ ...form, vaccination_details: e.target.value })} placeholder="List vaccinations and dates..." /></div>
              <div className="space-y-2"><Label>Medical Information</Label><Textarea value={form.medical_info} onChange={e => setForm({ ...form, medical_info: e.target.value })} placeholder="Medications, conditions, surgeries..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Food Type</Label><Input value={form.food_type} onChange={e => setForm({ ...form, food_type: e.target.value })} placeholder="e.g. Dry kibble, pellets" /></div>
                <div className="space-y-2"><Label>Feeding Schedule</Label><Input value={form.food_schedule} onChange={e => setForm({ ...form, food_schedule: e.target.value })} placeholder="e.g. 8am & 5pm" /></div>
              </div>
              <div className="space-y-2"><Label>Allergies</Label><Input value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} placeholder="Food or environmental" /></div>
            </>)}

            {tab === 'vet' && (<>
              <div className="space-y-2"><Label>{isDog ? 'Vet Practice Name' : 'Vet / Practitioner Name'}</Label><Input value={form.vet_name} onChange={e => setForm({ ...form, vet_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Phone</Label><Input value={form.vet_phone} onChange={e => setForm({ ...form, vet_phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Address</Label><Input value={form.vet_address} onChange={e => setForm({ ...form, vet_address: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Emergency Contact Name</Label><Input value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} /></div>
                <div className="space-y-2"><Label>Emergency Contact Phone</Label><Input value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} /></div>
              </div>
            </>)}

            {tab === 'behaviour' && (<>
              <div className="space-y-2"><Label>Temperament</Label><Input value={form.temperament} onChange={e => setForm({ ...form, temperament: e.target.value })} placeholder="e.g. Calm, playful, shy" /></div>
              <div className="grid grid-cols-2 gap-4 py-2">
                {isDog && <Toggle checked={form.off_lead} onChange={v => setForm({ ...form, off_lead: v })} label="Can Walk Off Lead" />}
                <Toggle checked={form.good_with_dogs} onChange={v => setForm({ ...form, good_with_dogs: v })} label="Good With Other Pets" />
                <Toggle checked={form.good_with_children} onChange={v => setForm({ ...form, good_with_children: v })} label="Good With Children" />
              </div>
            </>)}
          </div>

          <DialogFooter><Button variant="outline" onClick={() => setEditPet(null)} disabled={uploading}>Cancel</Button><Button onClick={handleSave} disabled={uploading}>{uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</> : 'Update'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove {deleteConfirm?.name}?</DialogTitle></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Remove</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add pet */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add a pet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Owner <span className="text-[#E06D53]">*</span></Label>
              <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                <SelectTrigger data-testid="add-pet-owner-select"><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name || '(no name)'} — {c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && <p className="text-xs text-[#E06D53]">No active clients yet — add a client first.</p>}
            </div>

            <div className="space-y-2">
              <Label>Species</Label>
              <SpeciesPicker value={newForm.species} onChange={(v) => setNewForm({ ...newForm, species: v, details: {} })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Name <span className="text-[#E06D53]">*</span></Label><Input value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} data-testid="add-pet-name" /></div>
              <div className="space-y-2"><Label>{newForm.species === 'dog' ? 'Breed' : 'Breed / type'}</Label><Input value={newForm.breed} onChange={e => setNewForm({ ...newForm, breed: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Age (yrs)</Label><Input type="number" min={0} value={newForm.age} onChange={e => setNewForm({ ...newForm, age: e.target.value })} /></div>
              {newForm.species !== 'fish' && <div className="space-y-2"><Label>Weight (kg)</Label><Input type="number" min={0} step={0.1} value={newForm.weight} onChange={e => setNewForm({ ...newForm, weight: e.target.value })} /></div>}
              {newForm.species === 'dog' && <div className="space-y-2"><Label>Size</Label><Select value={newForm.size} onValueChange={v => setNewForm({ ...newForm, size: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOG_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>}
            </div>
            <div className="space-y-2"><Label>Special notes</Label><Textarea value={newForm.special_notes} onChange={e => setNewForm({ ...newForm, special_notes: e.target.value })} /></div>
            <p className="text-xs text-[#8A8A8A]">Only name + owner are required — other details can be filled in from Edit later.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAddPet} disabled={saving || !newOwnerId || !newForm.name.trim()} data-testid="add-pet-confirm">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Adding...</> : 'Add pet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
