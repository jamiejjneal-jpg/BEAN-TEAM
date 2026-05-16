'use client'

// Admin Promos — CRUD for promo codes. Tracks usage.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Percent, Plus, Pencil, Trash2, Loader2, Tag, Power } from 'lucide-react'
import { toast } from 'sonner'

type Promo = {
  id: string
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed'
  amount: number
  valid_from: string | null
  valid_until: string | null
  max_uses: number | null
  used_count: number
  applies_to: string | null
  is_active: boolean
}

const EMPTY: Promo = { id: '', code: '', description: '', discount_type: 'percent', amount: 10, valid_from: null, valid_until: null, max_uses: null, used_count: 0, applies_to: null, is_active: true }

export default function AdminPromosPage() {
  const supabase = createClient()
  const [promos, setPromos] = useState<Promo[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Promo | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [p, s] = await Promise.all([
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('site_services').select('value, label').eq('client_bookable', true),
    ])
    setPromos((p.data as Promo[]) || [])
    setServices((s.data as any[]) || [])
    setLoading(false)
  }

  function openNew() {
    setEditing({ ...EMPTY, id: '', code: 'NEW' + Math.floor(Math.random() * 1000) })
  }
  function openEdit(p: Promo) { setEditing({ ...p }) }

  async function save() {
    if (!editing) return
    const code = (editing.code || '').trim().toUpperCase()
    if (!code) { toast.error('Code required'); return }
    if (!(editing.amount > 0)) { toast.error('Amount must be > 0'); return }
    setSaving(true)
    const payload = {
      code, description: editing.description?.trim() || null,
      discount_type: editing.discount_type, amount: editing.amount,
      valid_from: editing.valid_from || null, valid_until: editing.valid_until || null,
      max_uses: editing.max_uses && editing.max_uses > 0 ? editing.max_uses : null,
      applies_to: editing.applies_to || null,
      is_active: editing.is_active,
      updated_at: new Date().toISOString(),
    }
    const { error } = editing.id
      ? await supabase.from('promo_codes').update(payload).eq('id', editing.id)
      : await supabase.from('promo_codes').insert(payload)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing.id ? 'Promo updated' : 'Promo created')
    setEditing(null)
    fetchAll()
  }

  async function toggleActive(p: Promo) {
    await supabase.from('promo_codes').update({ is_active: !p.is_active, updated_at: new Date().toISOString() }).eq('id', p.id)
    fetchAll()
  }

  async function remove(p: Promo) {
    if (!confirm(`Delete promo "${p.code}"? This won't affect bookings already discounted with it.`)) return
    const { error } = await supabase.from('promo_codes').delete().eq('id', p.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    fetchAll()
  }

  return (
    <div className="space-y-6" data-testid="admin-promos-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="h-7 w-7 text-[#1A4331]" /> Promo codes
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">
            Create discount codes clients can apply at booking. Track usage and set expiry.
          </p>
        </div>
        <Button onClick={openNew} data-testid="new-promo"><Plus className="h-4 w-4 mr-1" /> New promo</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
      ) : promos.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-[#8A8A8A]">
          No promos yet. Create one to give clients money off.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {promos.map(p => (
            <Card key={p.id} data-testid={`promo-${p.code}`}>
              <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${p.is_active ? 'bg-[#E8F0EC] text-[#1A4331]' : 'bg-[#F2F0EB] text-[#8A8A8A]'}`}>
                  <Percent className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-lg">{p.code}</p>
                  <p className="text-xs text-[#5C5C5C]">
                    {p.discount_type === 'percent' ? `${p.amount}% off` : `£${p.amount.toFixed(2)} off`}
                    {p.applies_to && ` · ${p.applies_to.split(',').length} service${p.applies_to.split(',').length === 1 ? '' : 's'}`}
                    {p.valid_until && ` · expires ${p.valid_until}`}
                  </p>
                  {p.description && <p className="text-xs text-[#8A8A8A] mt-0.5 truncate">{p.description}</p>}
                </div>
                <div className="text-right text-xs text-[#5C5C5C] mr-2">
                  <p>{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''} used</p>
                  <p className={p.is_active ? 'text-[#1A4331]' : 'text-[#E06D53]'}>{p.is_active ? 'Active' : 'Inactive'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleActive(p)} data-testid={`toggle-${p.code}`}><Power className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(p)} data-testid={`edit-${p.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={() => remove(p)} className="text-[#E06D53] border-[#E06D53]/30 hover:bg-[#FDEDEA]" data-testid={`del-${p.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => !saving && !v && setEditing(null)}>
        <DialogContent data-testid="promo-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit promo' : 'New promo'}</DialogTitle>
            <DialogDescription>Codes are case-insensitive. Use SHORT and MEMORABLE codes.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} className="font-mono" data-testid="p-code" />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="e.g. New client first walk" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Discount type</Label>
                  <Select value={editing.discount_type} onValueChange={v => setEditing({ ...editing, discount_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% off</SelectItem>
                      <SelectItem value="fixed">£ off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{editing.discount_type === 'percent' ? '%' : '£'} amount</Label>
                  <Input type="number" min={0.01} step={editing.discount_type === 'percent' ? 1 : 0.5} value={editing.amount} onChange={e => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} data-testid="p-amount" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valid from</Label>
                  <Input type="date" value={editing.valid_from || ''} onChange={e => setEditing({ ...editing, valid_from: e.target.value || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valid until</Label>
                  <Input type="date" value={editing.valid_until || ''} onChange={e => setEditing({ ...editing, valid_until: e.target.value || null })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Max uses (blank = unlimited)</Label>
                <Input type="number" min={1} value={editing.max_uses ?? ''} onChange={e => setEditing({ ...editing, max_uses: e.target.value ? parseInt(e.target.value) : null })} placeholder="e.g. 100" />
              </div>
              <div className="space-y-1.5">
                <Label>Applies to services</Label>
                <p className="text-xs text-[#8A8A8A]">Comma-separated service slugs. Leave blank to apply to all.</p>
                <Input value={editing.applies_to || ''} onChange={e => setEditing({ ...editing, applies_to: e.target.value })} placeholder={services.slice(0, 3).map(s => s.value).join(',')} />
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#F2F0EB]">
                <Label>Active</Label>
                <Switch checked={editing.is_active} onCheckedChange={v => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="save-promo">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
