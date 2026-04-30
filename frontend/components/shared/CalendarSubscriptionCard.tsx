'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Calendar, Copy, RefreshCw, Loader2, Trash2, Check } from 'lucide-react'

// Role-aware description copy
const ROLE_HELP: Record<string, string> = {
  admin: "Subscribe on your phone to see EVERY booking (all walkers, all clients) — ideal for your overview calendar.",
  walker: "Subscribe to your own feed so the walks you've been assigned appear directly on your phone calendar.",
  client: "Subscribe so your booked walks show up on your phone calendar automatically — even when we change them.",
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')

export function CalendarSubscriptionCard() {
  const { user, profile } = useAuth()
  const supabase = createClient()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('calendar_tokens')
        .select('token')
        .eq('user_id', user.id)
        .maybeSingle()
      setToken(data?.token || null)
      setLoading(false)
    })()
  }, [user])

  async function generate() {
    if (!user) return
    setBusy(true)
    const { data, error } = await supabase
      .from('calendar_tokens')
      .insert({ user_id: user.id })
      .select('token')
      .single()
    setBusy(false)
    if (error) { toast.error('Could not generate: ' + error.message); return }
    setToken(data.token)
    toast.success('Subscription link ready')
  }

  async function regenerate() {
    if (!user || !token) return
    if (!confirm('Regenerate? The old link will stop working immediately.')) return
    setBusy(true)
    // Delete the old row then insert a fresh one so we guarantee a new token.
    await supabase.from('calendar_tokens').delete().eq('user_id', user.id)
    const { data, error } = await supabase
      .from('calendar_tokens')
      .insert({ user_id: user.id })
      .select('token')
      .single()
    setBusy(false)
    if (error) { toast.error('Failed: ' + error.message); return }
    setToken(data.token)
    toast.success('New link generated — old one is now invalid')
  }

  async function revoke() {
    if (!user) return
    if (!confirm('Revoke this link? Your phone calendar will stop updating.')) return
    setBusy(true)
    await supabase.from('calendar_tokens').delete().eq('user_id', user.id)
    setBusy(false)
    setToken(null)
    toast.success('Subscription revoked')
  }

  const httpsUrl = token ? `${SUPABASE_URL}/functions/v1/ical-feed?token=${token}` : ''
  const webcalUrl = httpsUrl.replace(/^https:/, 'webcal:')

  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v)
      setCopied(true); toast.success('Copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — long-press the URL to copy manually')
    }
  }

  if (loading) return null

  return (
    <Card data-testid="calendar-subscription-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#1A4331]" /> Phone Calendar Sync
        </CardTitle>
        <CardDescription>
          {ROLE_HELP[profile?.role || 'client']}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!token ? (
          <Button onClick={generate} disabled={busy} data-testid="generate-cal-link">
            {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…</> : <><Calendar className="h-4 w-4 mr-1.5" /> Generate subscription link</>}
          </Button>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#5C5C5C]">Tap &amp; hold to copy on mobile</label>
              <div className="flex gap-2 items-center">
                <input
                  readOnly
                  value={httpsUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 text-xs px-2.5 py-2 border border-[#E5E3DB] rounded-md bg-[#F9F8F6] font-mono text-[#1A4331] truncate"
                  data-testid="cal-url-input"
                />
                <Button variant="outline" size="sm" onClick={() => copy(httpsUrl)} data-testid="copy-cal-url">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <a href={webcalUrl} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-[#1A4331] text-white hover:bg-[#143328] transition-colors" data-testid="open-in-calendar">
                <Calendar className="h-4 w-4" /> Add to Apple/iPhone calendar
              </a>
              <a
                href={`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(httpsUrl)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border border-[#E5E3DB] hover:bg-[#F2F0EB] transition-colors"
                data-testid="open-in-google-cal"
              >
                Add to Google Calendar
              </a>
            </div>

            <details className="text-xs text-[#5C5C5C]">
              <summary className="cursor-pointer font-medium hover:text-[#1A4331]">How-to for Apple / Outlook</summary>
              <div className="mt-2 space-y-2 pl-2">
                <p><strong>iPhone / Mac:</strong> tap the green button above. If nothing happens, open Apple Calendar → File → &ldquo;New Calendar Subscription…&rdquo; → paste the HTTPS URL → Subscribe.</p>
                <p><strong>Outlook:</strong> Calendar → Add calendar → Subscribe from web → paste URL → Import.</p>
                <p><strong>Update frequency:</strong> calendar apps refresh every 1-24 hours. Force a refresh by pulling down on the calendar view.</p>
              </div>
            </details>

            <div className="flex gap-2 pt-1 border-t border-[#E5E3DB]">
              <Button variant="outline" size="sm" onClick={regenerate} disabled={busy} data-testid="regen-cal-link">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
              </Button>
              <Button variant="ghost" size="sm" onClick={revoke} disabled={busy} className="text-[#E06D53]" data-testid="revoke-cal-link">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Revoke
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
