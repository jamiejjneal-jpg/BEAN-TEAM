'use client'

// Unified "Site Setup" admin screen — per-page editable TEXT + IMAGES in one
// place. Replaces the old "Site Images" tab. Writes to site_texts and
// site_images tables. Public pages hot-reload the cache on navigation.

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Upload, RotateCcw, Loader2, Image as ImageIcon, CheckCircle2, Type, Globe, Save, LayoutTemplate, DollarSign, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { SITE_IMAGE_SLOTS, resolveSiteImages, type SiteImageKey } from '@/lib/site-images'
import { SITE_TEXT_SLOTS, type SiteTextKey } from '@/lib/site-texts'
import { invalidateSiteTextCache } from '@/components/shared/SiteText'
import { logAudit } from '@/lib/audit'

type ImgRow = { key: string; url: string; alt: string | null; updated_at: string }
type TxtRow = { key: string; value: string; updated_at: string }

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])

const PAGES: Array<{ id: 'Global' | 'Landing' | 'Pricing' | 'Auth'; label: string; icon: any }> = [
  { id: 'Global',  label: 'Global',  icon: Globe },
  { id: 'Landing', label: 'Landing', icon: LayoutTemplate },
  { id: 'Pricing', label: 'Pricing', icon: DollarSign },
  { id: 'Auth',    label: 'Auth',    icon: Lock },
]

// Image slots grouped by page so the UI can render per-tab.
const IMAGE_PAGE_OF: Record<SiteImageKey, 'Global' | 'Landing' | 'Pricing' | 'Auth'> = {
  site_logo: 'Global',
  landing_hero: 'Landing',
  pricing_portrait: 'Pricing',
  login_bg: 'Auth',
  register_bg: 'Auth',
}

export default function SiteSetupPage() {
  const supabase = createClient()
  const [imgRows, setImgRows] = useState<ImgRow[]>([])
  const [txtRows, setTxtRows] = useState<TxtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyImg, setBusyImg] = useState<SiteImageKey | null>(null)
  const [savingTxt, setSavingTxt] = useState<SiteTextKey | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [imgRes, txtRes] = await Promise.all([
      supabase.from('site_images').select('key, url, alt, updated_at'),
      supabase.from('site_texts').select('key, value, updated_at'),
    ])
    if (imgRes.error) toast.error('Load images: ' + imgRes.error.message)
    if (txtRes.error) toast.error('Load texts — have you run the site_texts SQL? ' + txtRes.error.message)
    setImgRows(imgRes.data || [])
    setTxtRows(txtRes.data || [])
    const d: Record<string, string> = {}
    for (const r of (txtRes.data as TxtRow[] | null) || []) d[r.key] = r.value
    setDrafts(d)
    setLoading(false)
  }

  async function uploadImage(key: SiteImageKey, file: File) {
    if (!ALLOWED_TYPES.has(file.type)) { toast.error('Only JPEG/PNG/WebP/GIF/SVG'); return }
    if (file.size > MAX_BYTES) { toast.error('File too large (max 8 MB)'); return }
    setBusyImg(key)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${key}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('site-images').upload(path, file, {
        contentType: file.type, upsert: true, cacheControl: '3600',
      })
      if (upErr) throw new Error(upErr.message)
      const url = supabase.storage.from('site-images').getPublicUrl(path).data.publicUrl
      const { error: dbErr } = await supabase.from('site_images').upsert({
        key, url, alt: null, updated_at: new Date().toISOString(), updated_by: user.id,
      }, { onConflict: 'key' })
      if (dbErr) throw new Error(dbErr.message)
      toast.success('Image updated')
      logAudit({ action: 'site_image_updated', target_type: 'site_image', target_id: key, target_name: key })
      fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Upload failed')
    } finally {
      setBusyImg(null)
    }
  }

  async function resetImage(key: SiteImageKey) {
    if (!confirm('Reset to the default image for this slot?')) return
    setBusyImg(key)
    const { error } = await supabase.from('site_images').delete().eq('key', key)
    setBusyImg(null)
    if (error) { toast.error(error.message); return }
    toast.success('Reset to default')
    fetchAll()
  }

  async function saveText(key: SiteTextKey) {
    const value = drafts[key] ?? ''
    setSavingTxt(key)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: upd, error } = await supabase.from('site_texts').upsert({
      key, value, updated_at: new Date().toISOString(), updated_by: user?.id || null,
    }, { onConflict: 'key' }).select('key')
    setSavingTxt(null)
    if (error) { toast.error('Save failed: ' + error.message); return }
    if (!upd || upd.length === 0) { toast.error('Save blocked — run the admin-write-policies SQL migration.'); return }
    toast.success('Text saved')
    invalidateSiteTextCache()
    fetchAll()
  }

  async function resetText(key: SiteTextKey) {
    const slot = SITE_TEXT_SLOTS.find(s => s.key === key)!
    if (!confirm(`Reset to default:\n\n"${slot.default}"\n\nProceed?`)) return
    const { error } = await supabase.from('site_texts').delete().eq('key', key)
    if (error) { toast.error(error.message); return }
    setDrafts(d => ({ ...d, [key]: slot.default }))
    invalidateSiteTextCache()
    toast.success('Reset to default')
    fetchAll()
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const imgOverrides = new Map(imgRows.map(r => [r.key, r]))
  const txtOverrides = new Set(txtRows.map(r => r.key))
  const resolvedImgs = resolveSiteImages(imgRows)

  return (
    <div className="space-y-6" data-testid="site-setup-page">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-[#E8F0EC] flex items-center justify-center shrink-0">
          <Type className="h-5 w-5 text-[#1A4331]" />
        </div>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Site Setup</h1>
          <p className="text-sm text-[#5C5C5C] mt-1 max-w-2xl">
            Edit every piece of copy and every photo on your public pages, without touching code. Changes go live instantly for new visitors.
          </p>
        </div>
      </div>

      <Tabs defaultValue="Global" className="space-y-4">
        <TabsList>
          {PAGES.map(p => {
            const Icon = p.icon
            return <TabsTrigger key={p.id} value={p.id} data-testid={`tab-${p.id}`}><Icon className="h-3.5 w-3.5 mr-1" /> {p.label}</TabsTrigger>
          })}
        </TabsList>

        {PAGES.map(page => {
          const texts = SITE_TEXT_SLOTS.filter(s => s.page === page.id)
          const images = SITE_IMAGE_SLOTS.filter(s => IMAGE_PAGE_OF[s.key] === page.id)
          return (
            <TabsContent key={page.id} value={page.id} className="space-y-6">
              {images.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C]">Images</p>
                  <div className="grid gap-5 md:grid-cols-2">
                    {images.map(slot => {
                      const overridden = imgOverrides.has(slot.key)
                      const url = resolvedImgs[slot.key]
                      const row = imgOverrides.get(slot.key)
                      return (
                        <Card key={slot.key} data-testid={`img-${slot.key}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <CardTitle className="text-sm">{slot.label}</CardTitle>
                                <p className="text-xs text-[#8A8A8A] mt-0.5">{slot.description}</p>
                              </div>
                              {overridden
                                ? <Badge variant="success" className="shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" /> Custom</Badge>
                                : <Badge variant="secondary" className="shrink-0">Default</Badge>}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className={`relative ${slot.aspect} max-h-52 rounded-lg overflow-hidden border border-[#E5E3DB] bg-[#F2F0EB]`}>
                              {url
                                ? <img src={url} alt={slot.defaultAlt} className="absolute inset-0 h-full w-full object-cover" />
                                : <div className="absolute inset-0 flex items-center justify-center text-[#9C8E7A] text-xs">No image yet</div>}
                            </div>
                            {row?.updated_at && <p className="text-[10px] text-[#9C8E7A] font-mono">Updated {new Date(row.updated_at).toLocaleString('en-GB')}</p>}
                            <ImageUpload slot={slot} busy={busyImg === slot.key} onUpload={(f) => uploadImage(slot.key, f)} />
                            {overridden && (
                              <Button size="sm" variant="outline" onClick={() => resetImage(slot.key)} disabled={busyImg === slot.key} data-testid={`img-reset-${slot.key}`}>
                                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to default
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {texts.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide font-semibold text-[#5C5C5C]">Text blocks</p>
                  <div className="space-y-2">
                    {texts.map(slot => {
                      const val = drafts[slot.key] ?? slot.default
                      const overridden = txtOverrides.has(slot.key)
                      const dirty = val !== (txtRows.find(r => r.key === slot.key)?.value ?? slot.default)
                      return (
                        <Card key={slot.key} data-testid={`txt-${slot.key}`}>
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{slot.label}</p>
                                {slot.help && <p className="text-xs text-[#8A8A8A]">{slot.help}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                {overridden
                                  ? <Badge variant="success" className="shrink-0 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Custom</Badge>
                                  : <Badge variant="secondary" className="shrink-0 text-[10px]">Default</Badge>}
                              </div>
                            </div>
                            {slot.kind === 'long'
                              ? <Textarea value={val} onChange={e => setDrafts(d => ({ ...d, [slot.key]: e.target.value }))} rows={3} className="resize-y" data-testid={`txt-input-${slot.key}`} />
                              : <Input value={val} onChange={e => setDrafts(d => ({ ...d, [slot.key]: e.target.value }))} data-testid={`txt-input-${slot.key}`} />}
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] text-[#9C8E7A]">
                                Default: <span className="italic">“{slot.default.length > 80 ? slot.default.slice(0, 80) + '…' : slot.default}”</span>
                              </p>
                              <div className="flex items-center gap-2">
                                {overridden && (
                                  <Button size="sm" variant="outline" onClick={() => resetText(slot.key)} data-testid={`txt-reset-${slot.key}`}>
                                    Reset
                                  </Button>
                                )}
                                <Button size="sm" onClick={() => saveText(slot.key)} disabled={!dirty || savingTxt === slot.key} data-testid={`txt-save-${slot.key}`}>
                                  {savingTxt === slot.key ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving</> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {images.length === 0 && texts.length === 0 && (
                <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">Nothing editable on this page yet.</CardContent></Card>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

function ImageUpload({ slot, busy, onUpload }: { slot: typeof SITE_IMAGE_SLOTS[number]; busy: boolean; onUpload: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex gap-2">
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" className="hidden" data-testid={`img-file-${slot.key}`}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); if (ref.current) ref.current.value = '' }} />
      <Button size="sm" onClick={() => ref.current?.click()} disabled={busy} data-testid={`img-upload-${slot.key}`}>
        {busy ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Uploading</> : <><Upload className="h-3.5 w-3.5 mr-1" /> Upload new</>}
      </Button>
    </div>
  )
}
