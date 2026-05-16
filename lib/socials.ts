// Caption + share helpers. Pure functions so they're easy to test.

export type CaptionContext = {
  dog_name?: string
  client_name?: string
  walker_name?: string
  service?: string
  date?: string
  ig_dog?: string | null      // raw handle, e.g. 'rocky_the_pup' (no @)
  fb_dog?: string | null
  ig_client?: string | null
  fb_client?: string | null
  caption?: string            // free-text from walker, if any
}

// Replace {token} placeholders with values from context.
// Unknown tokens are left blank (cleaner than leaving "{xxxx}" in the post).
export function renderCaption(template: string, ctx: CaptionContext): string {
  const tokens: Record<string, string> = {
    dog_name:     ctx.dog_name || 'our pup',
    client_name:  ctx.client_name || '',
    walker_name:  ctx.walker_name || '',
    service:      (ctx.service || '').replace(/_/g, ' '),
    date:         ctx.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
    caption:      ctx.caption || '',
    ig_dog:       ctx.ig_dog    ? `@${stripAt(ctx.ig_dog)} ` : '',
    fb_dog:       ctx.fb_dog    ? `@${stripAt(ctx.fb_dog)} ` : '',
    ig_client:    ctx.ig_client ? `@${stripAt(ctx.ig_client)} ` : '',
    fb_client:    ctx.fb_client ? `@${stripAt(ctx.fb_client)} ` : '',
  }
  let out = template.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? '')
  // Collapse multiple blank lines and excess whitespace
  out = out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
  return out
}

export function stripAt(handle: string): string {
  return (handle || '').trim().replace(/^@/, '')
}

// Browser share — uses Web Share API if available (mobile), falls back to
// copy-to-clipboard + open the photo so user can save it.
export async function shareToSocial(opts: {
  caption: string
  photoUrl: string
  title?: string
}): Promise<{ method: 'native' | 'clipboard' }> {
  if (typeof navigator === 'undefined') return { method: 'clipboard' }

  // Try the native share sheet first (iOS Safari + Android Chrome both support
  // this, including image sharing when we supply the photo as a File).
  if (navigator.share) {
    try {
      // Fetch the image and pass as File for native image share
      const resp = await fetch(opts.photoUrl, { mode: 'cors' })
      if (resp.ok) {
        const blob = await resp.blob()
        const file = new File([blob], 'walk-photo.jpg', { type: blob.type || 'image/jpeg' })
        // Some platforms only accept text+url, others accept files. Try files first.
        if ((navigator as any).canShare?.({ files: [file] })) {
          await navigator.share({ text: opts.caption, files: [file] as any, title: opts.title || 'Walk photo' })
          return { method: 'native' }
        }
      }
      // Fallback to text+URL share
      await navigator.share({ text: opts.caption, url: opts.photoUrl, title: opts.title || 'Walk photo' })
      return { method: 'native' }
    } catch {
      // user cancelled or share failed — fall through to clipboard
    }
  }

  // Clipboard fallback
  try { await navigator.clipboard.writeText(opts.caption) } catch { /* noop */ }
  // Open the photo so user can long-press save it
  try { window.open(opts.photoUrl, '_blank', 'noopener') } catch { /* noop */ }
  return { method: 'clipboard' }
}

// Quick links that pre-fill a post composer.
// FB supports a working composer URL; IG does not (you have to use the app).
export function facebookComposerUrl(photoUrl: string, caption: string): string {
  const u = new URL('https://www.facebook.com/sharer/sharer.php')
  u.searchParams.set('u', photoUrl)
  u.searchParams.set('quote', caption)
  return u.toString()
}
