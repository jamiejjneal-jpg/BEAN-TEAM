'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { PetPhotoStrip } from '@/components/shared/PetPhotoStrip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { DOG_SIZES } from '@/lib/utils'
import { PET_SPECIES, SPECIES_FIELDS, speciesConfig, type PetSpecies } from '@/lib/species'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Camera, X, Loader2 } from 'lucide-react'

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

export default function ClientPets() {
  const { user } = useAuth()
  const [pets, setPets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPet)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<'basic' | 'species' | 'health' | 'vet' | 'behaviour'>('basic')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { if (user) fetchPets() }, [user])

  async function fetchPets() {
    const { data } = await supabase.from('dogs').select('*').eq('owner_id', user!.id).order('created_at', { ascending: false })
    setPets(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(emptyPet); setEditingId(null); setPhotoFile(null); setPhotoPreview(null); setExistingPhotoUrl(null); setTab('basic'); setDialogOpen(true)
  }

  function openEdit(pet: any) {
    setForm({
      species: (pet.species || 'dog') as PetSpecies,
      name: pet.name || '', breed: pet.breed || '', age: pet.age?.toString() || '', weight: pet.weight?.toString() || '',
      size: pet.size || 'medium', special_notes: pet.special_notes || '', medical_info: pet.medical_info || '',
      off_lead: pet.off_lead || false, vet_name: pet.vet_name || '', vet_phone: pet.vet_phone || '',
      vet_address: pet.vet_address || '', vaccinations_up_to_date: pet.vaccinations_up_to_date || false,
      vaccination_details: pet.vaccination_details || '', food_type: pet.food_type || '',
      food_schedule: pet.food_schedule || '', allergies: pet.allergies || '',
      neutered: pet.neutered || false, microchipped: pet.microchipped || false,
      microchip_number: pet.microchip_number || '', emergency_contact: pet.emergency_contact || '',
      emergency_phone: pet.emergency_phone || '', temperament: pet.temperament || '',
      good_with_dogs: pet.good_with_dogs ?? true, good_with_children: pet.good_with_children ?? true,
      details: pet.details || {},
    })
    setEditingId(pet.id); setPhotoFile(null); setPhotoPreview(null); setExistingPhotoUrl(pet.photo_url || null); setTab('basic'); setDialogOpen(true)
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

  async function uploadPhoto(petId: string): Promise<string | null> {
    if (!photoFile) return existingPhotoUrl
    setUploading(true)
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${user!.id}/${petId}.${ext}`
    const { error } = await supabase.storage.from('dog-photos').upload(filePath, photoFile, { cacheControl: '3600', upsert: true })
    setUploading(false)
    if (error) { toast.error('Photo upload failed'); return existingPhotoUrl }
    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(filePath)
    return urlData?.publicUrl || null
  }

  async function handleSave() {
    const missing: string[] = []
    if (!form.name.trim()) missing.push('Name')
    if (form.species === 'dog' && !form.breed.trim()) missing.push('Breed')
    if (!form.age) missing.push('Age')
    if (form.species !== 'fish' && !form.weight) missing.push('Weight')
    if (!form.vet_name.trim()) missing.push('Vet / practitioner name')
    if (!form.vet_phone.trim()) missing.push('Vet / practitioner phone')
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.join(', ')}`)
      if (missing.some(m => ['Name', 'Breed', 'Age', 'Weight'].includes(m))) setTab('basic')
      else if (missing.some(m => m.startsWith('Vet'))) setTab('vet')
      return
    }
    const payload: any = {
      species: form.species,
      name: form.name, breed: form.breed, age: form.age ? parseInt(form.age) : null,
      weight: form.weight ? parseFloat(form.weight) : null, size: form.size,
      special_notes: form.special_notes, medical_info: form.medical_info, owner_id: user!.id,
      off_lead: form.off_lead, vet_name: form.vet_name, vet_phone: form.vet_phone, vet_address: form.vet_address,
      vaccinations_up_to_date: form.vaccinations_up_to_date, vaccination_details: form.vaccination_details,
      food_type: form.food_type, food_schedule: form.food_schedule, allergies: form.allergies,
      neutered: form.neutered, microchipped: form.microchipped, microchip_number: form.microchip_number,
      emergency_contact: form.emergency_contact, emergency_phone: form.emergency_phone,
      temperament: form.temperament, good_with_dogs: form.good_with_dogs, good_with_children: form.good_with_children,
      details: form.details || {},
    }

    if (editingId) {
      const photoUrl = await uploadPhoto(editingId)
      payload.photo_url = photoUrl
      const { error } = await supabase.from('dogs').update(payload).eq('id', editingId)
      if (error) { toast.error('Failed to update: ' + error.message); return }
      toast.success('Pet updated')
    } else {
      const { data: newPet, error } = await supabase.from('dogs').insert(payload).select().single()
      if (error) { toast.error('Failed to add pet: ' + error.message); return }
      if (photoFile && newPet) {
        const photoUrl = await uploadPhoto(newPet.id)
        if (photoUrl) await supabase.from('dogs').update({ photo_url: photoUrl }).eq('id', newPet.id)
      }
      toast.success('Pet added!')
    }
    setDialogOpen(false); fetchPets()
  }

  async function handleDelete(id: string) {
    await supabase.from('dogs').update({ is_active: false }).eq('id', id)
    toast.success('Pet removed'); fetchPets()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const currentPhotoUrl = photoPreview || existingPhotoUrl
  const activePets = pets.filter(p => p.is_active)
  const speciesExtras = SPECIES_FIELDS[form.species] || []
  const isDog = form.species === 'dog'

  const tabs = [
    { key: 'basic' as const, label: 'Basic Info' },
    ...(speciesExtras.length > 0 ? [{ key: 'species' as const, label: `${speciesConfig(form.species).label} details` }] : []),
    { key: 'health' as const, label: 'Health & Food' },
    { key: 'vet' as const, label: 'Vet & Emergency' },
    { key: 'behaviour' as const, label: 'Behaviour' },
  ]

  return (
    <div className="space-y-6" data-testid="client-pets-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Pets</h1>
          <p className="text-[#5C5C5C] mt-1">Manage your pets&apos; profiles</p>
        </div>
        <Button onClick={openNew} data-testid="add-pet-button"><Plus className="h-4 w-4 mr-1" /> Add Pet</Button>
      </div>

      {activePets.length === 0 ? (
        <Card className="border-dashed border-2"><CardContent className="py-12 text-center">
          <div className="h-12 w-12 mx-auto rounded-full bg-[#E8F0EC] flex items-center justify-center mb-4">
            {(() => { const Icon = speciesConfig('dog').icon; return <Icon className="h-6 w-6 text-[#1A4331]" /> })()}
          </div>
          <h3 className="font-heading font-semibold mb-2">No pets yet</h3>
          <p className="text-sm text-[#8A8A8A] mb-4">Add your first pet to get started</p>
          <Button onClick={openNew}>Add Your First Pet</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activePets.map((pet) => {
            const cfg = speciesConfig(pet.species as PetSpecies)
            const Icon = cfg.icon
            return (
              <Card key={pet.id} className="hover:shadow-md transition-shadow overflow-hidden">
                {pet.photo_url && <div className="h-40 w-full overflow-hidden"><img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" /></div>}
                <CardContent className={pet.photo_url ? 'p-5' : 'p-6'}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {!pet.photo_url && <div className="h-12 w-12 rounded-full bg-[#E8F0EC] flex items-center justify-center"><Icon className="h-6 w-6 text-[#1A4331]" /></div>}
                      <div>
                        <h3 className="font-heading font-semibold">{pet.name}</h3>
                        <p className="text-sm text-[#5C5C5C]">{pet.breed || cfg.label}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{cfg.label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {pet.species === 'dog' && pet.off_lead && <Badge variant="success" className="text-[10px]">Off Lead OK</Badge>}
                    {pet.vaccinations_up_to_date && <Badge variant="info" className="text-[10px]">Vaccinated</Badge>}
                    {pet.neutered && <Badge variant="secondary" className="text-[10px]">Neutered</Badge>}
                    {pet.microchipped && <Badge variant="secondary" className="text-[10px]">Chipped</Badge>}
                  </div>
                  <div className="space-y-1 text-sm text-[#5C5C5C]">
                    {pet.age && <p>Age: {pet.age}yrs{pet.weight ? ` | ${pet.weight}kg` : ''}</p>}
                    {pet.temperament && <p>Temperament: {pet.temperament}</p>}
                    {pet.special_notes && <p className="text-[#E06D53]">Notes: {pet.special_notes}</p>}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" onClick={() => openEdit(pet)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                    <Button size="sm" variant="ghost" className="text-[#E06D53]" onClick={() => handleDelete(pet.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Remove</Button>
                  </div>
                  <PetPhotoStrip petId={pet.id} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Pet' : 'Add New Pet'}</DialogTitle>
            <DialogDescription>Complete your pet&apos;s profile</DialogDescription>
          </DialogHeader>

          {/* Species picker — only on new, locked on edit to avoid schema drift */}
          {!editingId && (
            <div className="space-y-2 pb-4 border-b border-[#E5E3DB]">
              <Label>What kind of pet?</Label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {PET_SPECIES.map(s => {
                  const Icon = s.icon
                  const selected = form.species === s.value
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm({ ...form, species: s.value, details: {} })}
                      data-testid={`species-${s.value}`}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${selected ? 'border-[#1A4331] bg-[#E8F0EC] text-[#1A4331]' : 'border-[#E5E3DB] text-[#5C5C5C] hover:border-[#1A4331]/40'}`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-medium leading-tight text-center">{s.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-[#8A8A8A]">{speciesConfig(form.species).hint}</p>
            </div>
          )}

          {/* Photo */}
          <div className="flex items-center gap-4 pb-4 border-b border-[#E5E3DB]">
            {currentPhotoUrl ? (
              <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-[#E5E3DB]">
                <img src={currentPhotoUrl} alt="Pet" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setExistingPhotoUrl(null) }} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="h-20 w-20 rounded-xl border-2 border-dashed border-[#E5E3DB] flex flex-col items-center justify-center text-[#8A8A8A] hover:border-[#1A4331] hover:text-[#1A4331] transition-colors">
                <Camera className="h-5 w-5 mb-1" /><span className="text-[9px]">Add Photo</span>
              </button>
            )}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Camera className="h-3.5 w-3.5 mr-1.5" />{currentPhotoUrl ? 'Change' : 'Upload'} Photo</Button>
              <p className="text-xs text-[#8A8A8A] mt-1">JPG, PNG, WebP. Max 5MB.</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoSelect} />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#F2F0EB] rounded-lg p-1 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`flex-1 whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === t.key ? 'bg-white text-[#1A4331] shadow-sm' : 'text-[#5C5C5C] hover:text-[#1A1A1A]'}`}>{t.label}</button>
            ))}
          </div>

          <div className="space-y-4 min-h-[200px]">
            {tab === 'basic' && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Name <span className="text-[#E06D53]">*</span></Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} data-testid="pet-name-input" required /></div>
                <div className="space-y-2"><Label>{isDog ? 'Breed' : 'Breed / type'} {isDog && <span className="text-[#E06D53]">*</span>}</Label><Input value={form.breed} onChange={e => setForm({...form, breed: e.target.value})} data-testid="pet-breed-input" placeholder={isDog ? '' : 'Optional'} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Age (years) <span className="text-[#E06D53]">*</span></Label><Input type="number" min={0} value={form.age} onChange={e => setForm({...form, age: e.target.value})} required /></div>
                {form.species !== 'fish' && (
                  <div className="space-y-2"><Label>Weight (kg) <span className="text-[#E06D53]">*</span></Label><Input type="number" min={0} step={0.1} value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} required /></div>
                )}
                {isDog && (
                  <div className="space-y-2"><Label>Size</Label><Select value={form.size} onValueChange={v => setForm({...form, size: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOG_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                )}
              </div>
              <div className="space-y-2"><Label>Special Notes</Label><Textarea value={form.special_notes} onChange={e => setForm({...form, special_notes: e.target.value})} placeholder={`Any important notes about your ${speciesConfig(form.species).label.toLowerCase()}...`} /></div>
            </>)}

            {tab === 'species' && speciesExtras.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-[#8A8A8A]">Details specific to {speciesConfig(form.species).pluralLabel.toLowerCase()}</p>
                {speciesExtras.map(f => {
                  const v = form.details?.[f.key]
                  const update = (val: any) => setForm({ ...form, details: { ...(form.details || {}), [f.key]: val } })
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
            )}

            {tab === 'health' && (<>
              <div className="grid grid-cols-2 gap-4">
                <Toggle checked={form.vaccinations_up_to_date} onChange={v => setForm({...form, vaccinations_up_to_date: v})} label="Vaccinations Up to Date" />
                <Toggle checked={form.neutered} onChange={v => setForm({...form, neutered: v})} label="Neutered / Spayed" />
                <Toggle checked={form.microchipped} onChange={v => setForm({...form, microchipped: v})} label="Microchipped" />
              </div>
              {form.microchipped && <div className="space-y-2"><Label>Microchip Number</Label><Input value={form.microchip_number} onChange={e => setForm({...form, microchip_number: e.target.value})} /></div>}
              <div className="space-y-2"><Label>Vaccination Details</Label><Textarea value={form.vaccination_details} onChange={e => setForm({...form, vaccination_details: e.target.value})} placeholder="List vaccinations and dates..." /></div>
              <div className="space-y-2"><Label>Medical Information</Label><Textarea value={form.medical_info} onChange={e => setForm({...form, medical_info: e.target.value})} placeholder="Medications, conditions, previous surgeries..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Food Type</Label><Input value={form.food_type} onChange={e => setForm({...form, food_type: e.target.value})} placeholder="e.g. Dry kibble, pellets, flakes" /></div>
                <div className="space-y-2"><Label>Feeding Schedule</Label><Input value={form.food_schedule} onChange={e => setForm({...form, food_schedule: e.target.value})} placeholder="e.g. Twice daily, 8am & 5pm" /></div>
              </div>
              <div className="space-y-2"><Label>Allergies</Label><Input value={form.allergies} onChange={e => setForm({...form, allergies: e.target.value})} placeholder="Food or environmental allergies" /></div>
            </>)}

            {tab === 'vet' && (<>
              <div className="space-y-2"><Label>{isDog ? 'Vet Practice Name' : 'Vet / Practitioner Name'} <span className="text-[#E06D53]">*</span></Label><Input value={form.vet_name} onChange={e => setForm({...form, vet_name: e.target.value})} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Phone <span className="text-[#E06D53]">*</span></Label><Input value={form.vet_phone} onChange={e => setForm({...form, vet_phone: e.target.value})} required /></div>
                <div className="space-y-2"><Label>Address</Label><Input value={form.vet_address} onChange={e => setForm({...form, vet_address: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Emergency Contact Name</Label><Input value={form.emergency_contact} onChange={e => setForm({...form, emergency_contact: e.target.value})} /></div>
                <div className="space-y-2"><Label>Emergency Contact Phone</Label><Input value={form.emergency_phone} onChange={e => setForm({...form, emergency_phone: e.target.value})} /></div>
              </div>
            </>)}

            {tab === 'behaviour' && (<>
              <div className="space-y-2"><Label>Temperament</Label><Input value={form.temperament} onChange={e => setForm({...form, temperament: e.target.value})} placeholder="e.g. Calm, playful, shy, vocal" /></div>
              <div className="grid grid-cols-2 gap-4 py-2">
                {isDog && <Toggle checked={form.off_lead} onChange={v => setForm({...form, off_lead: v})} label="Can Walk Off Lead" />}
                <Toggle checked={form.good_with_dogs} onChange={v => setForm({...form, good_with_dogs: v})} label="Good With Other Pets" />
                <Toggle checked={form.good_with_children} onChange={v => setForm({...form, good_with_children: v})} label="Good With Children" />
              </div>
              <div className="space-y-2"><Label>Behavioural Notes</Label><Textarea value={form.special_notes} onChange={e => setForm({...form, special_notes: e.target.value})} placeholder="Any triggers, fears, quirks..." /></div>
            </>)}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={uploading}>{uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Uploading...</> : editingId ? 'Update' : 'Add Pet'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
