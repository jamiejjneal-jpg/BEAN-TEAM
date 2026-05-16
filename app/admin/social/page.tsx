'use client'

// Admin → Social Settings.
// Foundation for Option A (full Meta auto-post). Until Meta App Review is
// approved + tokens are pasted, only the share-assist (Option B) works.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Save, Share2, Loader2, ExternalLink, Facebook, Instagram } from 'lucide-react'
import { toast } from 'sonner'

type Cfg = {
  enabled: boolean
  caption_template: string
  fb_page_id: string
  fb_page_access_token: string
  ig_business_account_id: string
  default_hashtags: string
  auto_post: boolean
  walker_can_post: boolean
}

const DEFAULTS: Cfg = {
  enabled: false,
  caption_template: `Today's adventure with {dog_name}! 🐾\n\n{caption}\n\n{ig_dog}{ig_client} #DogWalker #PetCare #RockysRetreat`,
  fb_page_id: '',
  fb_page_access_token: '',
  ig_business_account_id: '',
  default_hashtags: '#DogWalker #PetCare #RockysRetreat',
  auto_post: false,
  walker_can_post: true,
}

export default function AdminSocialPage() {
  const supabase = createClient()
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('site_socials').select('*').eq('id', 'primary').maybeSingle()
      if (data) setCfg({
        enabled: !!data.enabled,
        caption_template: data.caption_template || DEFAULTS.caption_template,
        fb_page_id: data.fb_page_id || '',
        fb_page_access_token: data.fb_page_access_token || '',
        ig_business_account_id: data.ig_business_account_id || '',
        default_hashtags: data.default_hashtags || DEFAULTS.default_hashtags,
        auto_post: !!data.auto_post,
        walker_can_post: data.walker_can_post !== false,
      })
      setLoading(false)
    })()
  }, [supabase])

  async function save() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('site_socials').upsert({
        id: 'primary',
        ...cfg,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      if (error) toast.error(error.message)
      else toast.success('Settings saved')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-3xl" data-testid="admin-social-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Share2 className="h-7 w-7 text-[#1A4331]" /> Social Media
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">
          Configure caption templates and (later) connect Facebook + Instagram for auto-posting.
        </p>
      </div>

      {/* Caption template */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <p className="font-heading text-lg font-semibold">Caption template</p>
            <p className="text-xs text-[#5C5C5C]">
              Used when staff press "Share" on a walk photo. Tokens are replaced automatically.
            </p>
          </div>
          <Textarea
            value={cfg.caption_template}
            onChange={e => setCfg({ ...cfg, caption_template: e.target.value })}
            rows={6}
            className="font-mono text-xs"
            data-testid="caption-template"
          />
          <div className="text-xs text-[#5C5C5C] grid grid-cols-2 sm:grid-cols-3 gap-1">
            <code className="bg-[#F2F0EB] px-1 rounded">{`{dog_name}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{client_name}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{walker_name}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{service}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{date}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{caption}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{ig_dog}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{ig_client}`}</code>
            <code className="bg-[#F2F0EB] px-1 rounded">{`{fb_client}`}</code>
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="font-heading text-lg font-semibold">Permissions</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Walkers can share</p>
              <p className="text-xs text-[#5C5C5C]">When on, walkers see a "Share" button on their walk photos.</p>
            </div>
            <Switch checked={cfg.walker_can_post} onCheckedChange={v => setCfg({ ...cfg, walker_can_post: v })} data-testid="walker-can-post" />
          </div>
        </CardContent>
      </Card>

      {/* Meta API foundation */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <p className="font-heading text-lg font-semibold flex items-center gap-2"><Facebook className="h-5 w-5 text-[#1877F2]" /> <Instagram className="h-5 w-5 text-[#E1306C]" /> Meta API (auto-post)</p>
            <p className="text-xs text-[#5C5C5C] mt-1">
              Optional — only fill in once your Meta Developer App is App-Review-approved. Until then, leave blank and rely on the manual share button.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Facebook Page ID</Label>
              <Input value={cfg.fb_page_id} onChange={e => setCfg({ ...cfg, fb_page_id: e.target.value })} placeholder="e.g. 123456789012345" data-testid="fb-page-id" />
            </div>
            <div className="space-y-1.5">
              <Label>Facebook Page Access Token (long-lived)</Label>
              <Input type="password" value={cfg.fb_page_access_token} onChange={e => setCfg({ ...cfg, fb_page_access_token: e.target.value })} placeholder="Paste your token" data-testid="fb-token" />
              <p className="text-[10px] text-[#8A8A8A]">Generated in your Meta Developer dashboard. Keep this secret.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Instagram Business Account ID</Label>
              <Input value={cfg.ig_business_account_id} onChange={e => setCfg({ ...cfg, ig_business_account_id: e.target.value })} placeholder="e.g. 17841400000000000" data-testid="ig-biz-id" />
            </div>
            <div className="flex items-start justify-between gap-3 pt-2 border-t border-[#F2F0EB]">
              <div>
                <p className="font-medium">Enable auto-posting</p>
                <p className="text-xs text-[#5C5C5C]">When on and credentials are valid, "Share" becomes one-tap publishing.</p>
              </div>
              <Switch checked={cfg.auto_post} onCheckedChange={v => setCfg({ ...cfg, auto_post: v })} disabled={!cfg.fb_page_access_token || !cfg.ig_business_account_id} data-testid="auto-post" />
            </div>
          </div>

          <details className="text-xs text-[#5C5C5C] pt-2 border-t border-[#F2F0EB]">
            <summary className="cursor-pointer font-medium">How do I get these values?</summary>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Set up a Facebook Page and link an Instagram Business or Creator account.</li>
              <li>Create a Meta Developer App at <a className="underline text-[#1A4331]" href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com <ExternalLink className="inline h-3 w-3" /></a></li>
              <li>Add the <em>Facebook Login</em> + <em>Instagram Graph API</em> products.</li>
              <li>Request permissions: <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>instagram_basic</code>, <code>instagram_content_publish</code>. Submit for App Review.</li>
              <li>Once approved, generate a long-lived Page Access Token via <em>Graph API Explorer</em> and paste it here.</li>
              <li>Page ID + IG Business ID are visible in your Page settings.</li>
            </ol>
          </details>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} size="lg" className="w-full sm:w-auto" data-testid="save-social">
        {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-1" /> Save settings</>}
      </Button>
    </div>
  )
}
