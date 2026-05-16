'use client'

// Reusable "Share to socials" button for walk photos.
// - Hidden from clients (clients see posts on FB/IG, not the share UI)
// - Walkers see it if `walker_can_post` is enabled in site_socials
// - Admins always see it
// - Tap opens a small composer: editable caption (pre-rendered from template)
//   + buttons to Share natively / Copy caption / Open Facebook composer

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Share2, Copy, Facebook, Instagram, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { renderCaption, shareToSocial, facebookComposerUrl, type CaptionContext } from '@/lib/socials'

export type ShareToSocialsButtonProps = {
  photoUrl: string
  bookingId?: string | null
  dogId?: string | null
  ctx?: CaptionContext
  className?: string
  // Optional inline-style: render a smaller icon-only button
  iconOnly?: boolean
}

const FALLBACK_TEMPLATE = `Today's adventure with {dog_name}! 🐾

{caption}

{ig_dog}{ig_client} #DogWalker #PetCare #RockysRetreat`

export function ShareToSocialsButton(props: ShareToSocialsButtonProps) {
  const supabase = createClient()
  const [allowed, setAllowed] = useState<null | boolean>(null) // null = still checking
  const [role, setRole] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [template, setTemplate] = useState<string>(FALLBACK_TEMPLATE)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (mounted) setAllowed(false); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      const r = (profile as any)?.role
      if (mounted) setRole(r)

      // Hide entirely from clients
      if (r === 'client') { if (mounted) setAllowed(false); return }

      // Walker visibility depends on the site_socials toggle. Admin always sees.
      if (r === 'admin') { if (mounted) setAllowed(true) }
      else {
        const { data: cfg } = await supabase.from('site_socials').select('walker_can_post, caption_template').eq('id', 'primary').maybeSingle()
        if (mounted) {
          setAllowed((cfg as any)?.walker_can_post !== false)
          if ((cfg as any)?.caption_template) setTemplate((cfg as any).caption_template)
        }
      }

      // Always try to load the template (admin too)
      if (r === 'admin') {
        const { data: cfg } = await supabase.from('site_socials').select('caption_template').eq('id', 'primary').maybeSingle()
        if (mounted && (cfg as any)?.caption_template) setTemplate((cfg as any).caption_template)
      }
    })()
    return () => { mounted = false }
  }, [supabase])

  function prepare() {
    const rendered = renderCaption(template, props.ctx || {})
    setCaption(rendered)
    setOpen(true)
  }

  async function recordShare(channel: 'manual' | 'facebook' | 'instagram') {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('share_log').insert({
        photo_url: props.photoUrl,
        dog_id: props.dogId || null,
        booking_id: props.bookingId || null,
        walker_id: role === 'walker' ? user?.id : null,
        channel,
        caption,
        status: 'shared',
        created_by: user?.id,
      })
    } catch { /* best-effort */ }
  }

  async function doShare() {
    setBusy(true)
    try {
      const result = await shareToSocial({ caption, photoUrl: props.photoUrl, title: 'Walk photo' })
      await recordShare('manual')
      toast.success(result.method === 'native' ? 'Share sheet opened' : 'Caption copied — photo opened in a new tab')
      setOpen(false)
    } finally { setBusy(false) }
  }

  async function doCopy() {
    setBusy(true)
    try {
      await navigator.clipboard.writeText(caption)
      await recordShare('manual')
      toast.success('Caption copied')
    } catch { toast.error('Copy failed') }
    finally { setBusy(false) }
  }

  async function doFb() {
    await recordShare('facebook')
    window.open(facebookComposerUrl(props.photoUrl, caption), '_blank', 'noopener')
  }

  async function doIg() {
    // Instagram has no working web composer; best we can do is copy caption +
    // tell the user to paste into the IG app.
    await recordShare('instagram')
    try { await navigator.clipboard.writeText(caption) } catch {}
    toast.success('Caption copied — open Instagram and paste it into your new post')
  }

  if (allowed === null) return null
  if (!allowed) return null

  if (props.iconOnly) {
    return (
      <>
        <button type="button" onClick={prepare} title="Share to socials" className={`p-1.5 rounded-md hover:bg-[#F2F0EB] text-[#5C5C5C] hover:text-[#1A4331] ${props.className || ''}`} data-testid="share-icon-btn">
          <Share2 className="h-4 w-4" />
        </button>
        {open && <ComposerDialog
          open={open} onClose={() => setOpen(false)}
          caption={caption} setCaption={setCaption}
          busy={busy} doShare={doShare} doCopy={doCopy} doFb={doFb} doIg={doIg}
          photoUrl={props.photoUrl}
        />}
      </>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={prepare} className={props.className} data-testid="share-btn">
        <Share2 className="h-4 w-4 mr-1" /> Share
      </Button>
      <ComposerDialog
        open={open} onClose={() => setOpen(false)}
        caption={caption} setCaption={setCaption}
        busy={busy} doShare={doShare} doCopy={doCopy} doFb={doFb} doIg={doIg}
        photoUrl={props.photoUrl}
      />
    </>
  )
}

function ComposerDialog(p: {
  open: boolean
  onClose: () => void
  caption: string
  setCaption: (s: string) => void
  busy: boolean
  doShare: () => void
  doCopy: () => void
  doFb: () => void
  doIg: () => void
  photoUrl: string
}) {
  return (
    <Dialog open={p.open} onOpenChange={v => !p.busy && !v && p.onClose()}>
      <DialogContent className="max-w-lg" data-testid="share-composer">
        <DialogHeader>
          <DialogTitle>Share to socials</DialogTitle>
          <DialogDescription>
            Edit the caption, then share. The photo will open for you to save and upload alongside.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <img src={p.photoUrl} alt="Preview" className="w-full max-h-60 object-cover rounded-lg border border-[#E5E3DB]" />
          <Textarea
            value={p.caption}
            onChange={e => p.setCaption(e.target.value)}
            rows={6}
            className="font-mono text-xs"
            data-testid="caption-textarea"
          />
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={p.doCopy} disabled={p.busy} data-testid="share-copy"><Copy className="h-4 w-4 mr-1" /> Copy caption</Button>
          <Button variant="outline" onClick={p.doIg} disabled={p.busy} data-testid="share-ig"><Instagram className="h-4 w-4 mr-1" /> Open Instagram</Button>
          <Button variant="outline" onClick={p.doFb} disabled={p.busy} data-testid="share-fb"><Facebook className="h-4 w-4 mr-1" /> Open Facebook</Button>
          <Button onClick={p.doShare} disabled={p.busy} data-testid="share-native">
            {p.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Share2 className="h-4 w-4 mr-1" /> Share</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
