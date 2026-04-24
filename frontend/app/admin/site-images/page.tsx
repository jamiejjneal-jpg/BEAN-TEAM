'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, RotateCcw, Loader2, Image as ImageIcon, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { SITE_IMAGE_SLOTS, resolveSiteImages, type SiteImageKey } from '@/lib/site-images'
import { logAudit } from '@/lib/audit'

type Row = { key: string; url: string; alt: string | null; updated_at: string }

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default function SiteImagesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<SiteImageKey | null>(null)

  useEffect(() => { fetchRows() }, [])

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase
      .from('site_images')
      .select('key, url, alt, updated_at')
    if (error) {
      toast.error(`Failed to load site images: ${error.message}`)
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  async function upload(key: SiteImageKey, file: File) {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error('Only JPEG, PNG, WebP or GIF allowed')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('File too large (max 8 MB)')
      return
    }

    setBusy(key)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${key}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { contentType: file.type, upsert: true, cacheControl: '3600' })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const { data: pub } = supabase.storage.from('site-images').getPublicUrl(path)
      const url = pub.publicUrl

      const { error: dbErr } = await supabase.from('site_images').upsert({
        key,
        url,
        alt: null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, { onConflict: 'key' })
      if (dbErr) throw new Error(`DB write failed: ${dbErr.message}`)

      toast.success('Image updated — public pages will refresh momentarily')
      logAudit({ action: 'site_image_updated', target_type: 'site_image', target_id: key, target_name: key, details: { url } })
      fetchRows()
    } catch (e: any) {
      toast.error(e.message || 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function reset(key: SiteImageKey) {
    if (!confirm('Reset to the default image for this slot?')) return
    setBusy(key)
    const { error } = await supabase.from('site_images').delete().eq('key', key)
    setBusy(null)
    if (error) {
      toast.error(`Reset failed: ${error.message}`)
      return
    }
    toast.success('Reset to default')
    logAudit({ action: 'site_image_reset', target_type: 'site_image', target_id: key, target_name: key })
    fetchRows()
  }

  const resolved = resolveSiteImages(rows)
  const overrideMap = new Map(rows.map(r => [r.key, r]))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="site-images-page">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-[#E8F0EC] flex items-center justify-center shrink-0">
          <ImageIcon className="h-5 w-5 text-[#1A4331]" />
        </div>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Site Images</h1>
          <p className="text-sm text-[#5C5C5C] mt-1 max-w-2xl">
            Replace the photos shown on public pages — landing hero, pricing portrait and sign-in / sign-up panels.
            Changes go live immediately for new visitors.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {SITE_IMAGE_SLOTS.map(slot => {
          const overridden = overrideMap.has(slot.key)
          const url = resolved[slot.key]
          const row = overrideMap.get(slot.key)
          return (
            <SlotCard
              key={slot.key}
              slot={slot}
              url={url}
              overridden={overridden}
              updatedAt={row?.updated_at || null}
              busy={busy === slot.key}
              onUpload={(file) => upload(slot.key, file)}
              onReset={() => reset(slot.key)}
            />
          )
        })}
      </div>
    </div>
  )
}

function SlotCard({
  slot, url, overridden, updatedAt, busy, onUpload, onReset,
}: {
  slot: typeof SITE_IMAGE_SLOTS[number]
  url: string
  overridden: boolean
  updatedAt: string | null
  busy: boolean
  onUpload: (file: File) => void
  onReset: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Card className="overflow-hidden" data-testid={`site-image-card-${slot.key}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{slot.label}</CardTitle>
            <p className="text-xs text-[#8A8A8A] mt-1">{slot.description}</p>
          </div>
          {overridden ? (
            <Badge variant="success" className="shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" /> Custom</Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">Default</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`relative ${slot.aspect} max-h-64 rounded-lg overflow-hidden border border-[#E5E3DB] bg-[#F2F0EB]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={slot.defaultAlt} className="absolute inset-0 h-full w-full object-cover" />
        </div>

        {updatedAt && (
          <p className="text-[11px] text-[#8A8A8A] font-mono">
            Last updated: {new Date(updatedAt).toLocaleString('en-GB')}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          data-testid={`site-image-file-${slot.key}`}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            data-testid={`site-image-upload-${slot.key}`}
          >
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-2" /> Upload new</>}
          </Button>
          {overridden && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReset}
              disabled={busy}
              data-testid={`site-image-reset-${slot.key}`}
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reset to default
            </Button>
          )}
        </div>

        <p className="text-[11px] text-[#8A8A8A]">JPEG, PNG, WebP or GIF · max 8 MB</p>
      </CardContent>
    </Card>
  )
}
