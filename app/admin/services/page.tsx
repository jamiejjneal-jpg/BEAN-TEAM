'use client'

// Admin services editor — add/edit/reorder the services shown on the
// /client/book dropdown and the /pricing page. Writes to public.site_services.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, GripVertical, Loader2, PackageOpen } from 'lucide-react'
import { toast } from 'sonner'

function Switch({ checked, onCheckedChange, ...rest }: { checked: boolean; onCheckedChange: (v: boolean) => void } & Record<string, any>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-[#1A4331]' : 'bg-[#D1CFC6]'}`}
      {...rest}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

type Service = {
  id?: string
  value: string
  label: string
  description: string
  duration_minutes: number
  price: number
  price_label: string
  client_bookable: boolean
  show_on_pricing: boolean
  category: string
  sort_order: number
  is_active: boolean
}

const blank: Service = {
  value: '', label: '', description: '', duration_minutes: 30, price: 15, price_label: '',
  client_bookable: true, show_on_pricing: true, category: 'Walks', sort_order: 100, is_active: true,
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
}

export default function AdminServicesPage() {
  const supabase = createClient()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Service>(blank)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Service | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data, error } = await supabase.from('site_services').select('*').order('sort_order', { ascending: true })
    if (error) {
      toast.error('Load failed — have you run the site_services SQL migration? ' + error.message)
      setServices([])
    } else {
      setServices((data as Service[]) || [])
    }
    setLoading(false)
  }

  function openCreate() {
    setEditForm({ ...blank, sort_order: (services[services.length - 1]?.sort_order ?? 90) + 10 })
    setEditOpen(true)
  }

  function openEdit(s: Service) {
    setEditForm({ ...blank, ...s, description: s.description || '', price_label: s.price_label || '', category: s.category || '' })
    setEditOpen(true)
  }

  async function save() {
    if (!editForm.label.trim()) { toast.error('Label is required'); return }
    if (!editForm.value.trim()) editForm.value = slugify(editForm.label)
    if (!editForm.value) { toast.error('Give this service a short code (auto-generated from label)'); return }
    if (editForm.price < 0) { toast.error('Price must be 0 or more'); return }

    setSaving(true)
    const payload: any = {
      value: editForm.value.trim(),
      label: editForm.label.trim(),
      description: editForm.description.trim() || null,
      duration_minutes: Math.max(1, Math.floor(editForm.duration_minutes || 30)),
      price: Number(editForm.price) || 0,
      price_label: editForm.price_label.trim() || null,
      client_bookable: editForm.client_bookable,
      show_on_pricing: editForm.show_on_pricing,
      category: editForm.category.trim() || null,
      sort_order: Math.max(0, Math.floor(editForm.sort_order || 100)),
      is_active: editForm.is_active,
      updated_at: new Date().toISOString(),
    }
    let error: any
    if (editForm.id) {
      const res = await supabase.from('site_services').update(payload).eq('id', editForm.id).select('id')
      error = res.error
      if (!error && (res.data?.length ?? 0) === 0) error = { message: 'Save blocked — run the admin-write-policies SQL migration.' }
    } else {
      const res = await supabase.from('site_services').insert(payload).select('id').single()
      error = res.error
    }
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success(editForm.id ? 'Service updated' : 'Service added — it\'s now available in booking + pricing pages')
    setEditOpen(false)
    fetchAll()
  }

  async function remove(s: Service) {
    const { error } = await supabase.from('site_services').delete().eq('id', s.id!)
    if (error) { toast.error('Delete failed: ' + error.message); return }
    toast.success('Service removed')
    setDeleteConfirm(null)
    fetchAll()
  }

  async function moveOrder(s: Service, dir: -1 | 1) {
    const idx = services.findIndex(x => x.id === s.id)
    const other = services[idx + dir]
    if (!other) return
    await Promise.all([
      supabase.from('site_services').update({ sort_order: other.sort_order }).eq('id', s.id!),
      supabase.from('site_services').update({ sort_order: s.sort_order }).eq('id', other.id!),
    ])
    fetchAll()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6 max-w-5xl" data-testid="admin-services-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <PackageOpen className="h-7 w-7 text-[#1A4331]" /> Services
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">Edit what clients can book and what shows on the pricing page. Changes are live instantly — no deploy needed.</p>
        </div>
        <Button onClick={openCreate} data-testid="new-service"><Plus className="h-4 w-4 mr-1" /> Add service</Button>
      </div>

      {services.length === 0 && (
        <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">
          <PackageOpen className="h-8 w-8 mx-auto mb-2 text-[#D1CFC6]" />
          No services yet. The migration should have seeded the defaults — please paste the site_services SQL.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {services.map((s, i) => (
          <Card key={s.id} className={s.is_active ? '' : 'opacity-50'} data-testid={`service-${s.value}`}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex flex-col shrink-0">
                <button onClick={() => moveOrder(s, -1)} disabled={i === 0} className="p-1 text-[#8A8A8A] hover:text-[#1A4331] disabled:opacity-30" aria-label="Move up">▲</button>
                <GripVertical className="h-4 w-4 text-[#D1CFC6] mx-auto" />
                <button onClick={() => moveOrder(s, 1)} disabled={i === services.length - 1} className="p-1 text-[#8A8A8A] hover:text-[#1A4331] disabled:opacity-30" aria-label="Move down">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-heading font-semibold">{s.label}</p>
                  <span className="text-xs font-mono text-[#8A8A8A]">{s.value}</span>
                  {s.category && <span className="text-[10px] bg-[#F2F0EB] text-[#5C5C5C] rounded-full px-2 py-0.5">{s.category}</span>}
                  {!s.client_bookable && <span className="text-[10px] bg-[#FDF8EF] text-[#DDA74F] rounded-full px-2 py-0.5">not bookable</span>}
                  {!s.show_on_pricing && <span className="text-[10px] bg-[#FDEDEA] text-[#E06D53] rounded-full px-2 py-0.5">hidden from pricing</span>}
                  {!s.is_active && <span className="text-[10px] bg-[#F2F0EB] text-[#8A8A8A] rounded-full px-2 py-0.5">disabled</span>}
                </div>
                {s.description && <p className="text-sm text-[#5C5C5C] mt-0.5">{s.description}</p>}
                <p className="text-xs text-[#8A8A8A] mt-1">
                  {s.duration_minutes}-min · {s.price_label || `£${Number(s.price).toFixed(2)}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => openEdit(s)} data-testid={`edit-${s.value}`}><Pencil className="h-3.5 w-3.5" /></Button>
                <button onClick={() => setDeleteConfirm(s)} className="text-[#E06D53] hover:text-[#C95A41] p-1.5 rounded-md hover:bg-red-50" aria-label="Delete" data-testid={`del-${s.value}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !saving && setEditOpen(o)}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="service-dialog">
          <DialogHeader>
            <DialogTitle>{editForm.id ? 'Edit service' : 'New service'}</DialogTitle>
            <DialogDescription>Shown on the client booking form and pricing page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Display label</Label>
              <Input value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value, value: editForm.id ? editForm.value : slugify(e.target.value) })} placeholder='e.g. "Solo recall training (45 min)"' data-testid="svc-label" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Short code / slug</Label>
                <Input value={editForm.value} onChange={e => setEditForm({ ...editForm, value: slugify(e.target.value) })} placeholder="solo_recall" data-testid="svc-value" />
                <p className="text-[11px] text-[#8A8A8A]">Used internally for bookings. Change only if you know what you're doing.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} placeholder="Walks / Visits / Sitting…" data-testid="svc-category" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="A one-liner shown on the pricing page" data-testid="svc-description" />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Duration (min)</Label>
                <Input type="number" min={1} value={editForm.duration_minutes} onChange={e => setEditForm({ ...editForm, duration_minutes: parseInt(e.target.value) || 30 })} data-testid="svc-duration" />
              </div>
              <div className="space-y-1.5">
                <Label>Price (£)</Label>
                <Input type="number" step="0.01" min={0} value={editForm.price} onChange={e => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })} data-testid="svc-price" />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input type="number" value={editForm.sort_order} onChange={e => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 100 })} data-testid="svc-sort" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Price label override <span className="text-[#8A8A8A] font-normal">(e.g. "from £15", "£55/night")</span></Label>
              <Input value={editForm.price_label} onChange={e => setEditForm({ ...editForm, price_label: e.target.value })} placeholder="Leave blank to show the numeric price" data-testid="svc-price-label" />
            </div>
            <div className="grid sm:grid-cols-3 gap-3 pt-1">
              <label className="flex items-center gap-2 text-sm"><Switch checked={editForm.client_bookable} onCheckedChange={v => setEditForm({ ...editForm, client_bookable: v })} data-testid="svc-bookable" /> Clients can book</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editForm.show_on_pricing} onCheckedChange={v => setEditForm({ ...editForm, show_on_pricing: v })} data-testid="svc-pricing" /> Show on pricing</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editForm.is_active} onCheckedChange={v => setEditForm({ ...editForm, is_active: v })} data-testid="svc-active" /> Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="svc-save">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : 'Save service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent data-testid="service-delete-dialog">
          <DialogHeader>
            <DialogTitle>Remove “{deleteConfirm?.label}”?</DialogTitle>
            <DialogDescription>Existing bookings keep their service code but this service will vanish from the booking form and pricing page. Toggle "Active" off instead if you want to keep it for historical reporting.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button className="bg-[#E06D53] hover:bg-[#C95A41]" onClick={() => deleteConfirm && remove(deleteConfirm)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
