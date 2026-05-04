'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Bell, Mail, Loader2, BellOff, ChevronLeft, Eye } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

type Kind = 'booking' | 'walk_update' | 'photo_added' | 'review' | 'system'
const KINDS: { key: Kind; title: string; description: string }[] = [
  { key: 'booking',     title: 'Bookings',            description: 'When a walk is created, approved, cancelled or rescheduled.' },
  { key: 'walk_update', title: 'Walk updates',        description: 'When your walker picks up, drops off, or logs an update mid-walk.' },
  { key: 'photo_added', title: 'New photos',          description: 'When a photo of your dog is added to the gallery.' },
  { key: 'review',      title: 'Reviews & feedback',  description: 'When a walker leaves notes or a client leaves a review.' },
  { key: 'system',      title: 'Account & security',  description: 'Password resets, sign-in from new device, policy changes. Always recommended.' },
]

type Prefs = Record<string, boolean | string | null>

const DEFAULTS: Prefs = {
  inapp_booking: true,  inapp_walk_update: true,  inapp_photo_added: true,  inapp_review: true,  inapp_system: true,
  email_booking: true,  email_walk_update: false, email_photo_added: false, email_review: false, email_system: true,
  paused_until: null,
  digest_mode: 'instant',
}

export default function NotificationSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const router = useRouter()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    let mounted = true
    supabase.from('notification_prefs').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!mounted) return
        setPrefs({ ...DEFAULTS, ...(data || {}) })
      })
    return () => { mounted = false }
  }, [authLoading, user])

  async function setPref(key: string, value: boolean | string | null) {
    if (!user || !prefs) return
    setSaving(key)
    const next: Prefs = { ...prefs, [key]: value }
    setPrefs(next)
    const payload: any = {
      user_id: user.id,
      inapp_booking: next.inapp_booking, inapp_walk_update: next.inapp_walk_update, inapp_photo_added: next.inapp_photo_added, inapp_review: next.inapp_review, inapp_system: next.inapp_system,
      email_booking: next.email_booking, email_walk_update: next.email_walk_update, email_photo_added: next.email_photo_added, email_review: next.email_review, email_system: next.email_system,
      paused_until: next.paused_until,
      digest_mode: next.digest_mode || 'instant',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('notification_prefs').upsert(payload, { onConflict: 'user_id' })
    setSaving(null)
    if (error) {
      setPrefs(prefs) // revert
      toast.error('Save failed: ' + error.message)
    }
  }

  function pauseFor(hours: number) {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    setPref('paused_until', until)
    toast.success(`Notifications paused for ${hours} hours`)
  }
  function clearPause() { setPref('paused_until', null); toast.success('Notifications resumed') }

  // --- Digest preview ---------------------------------------------------
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<'daily' | 'weekly'>('daily')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewCount, setPreviewCount] = useState(0)

  async function openPreview(mode: 'daily' | 'weekly') {
    setPreviewMode(mode); setPreviewOpen(true); setPreviewLoading(true); setPreviewHtml('')
    try {
      const { data, error } = await supabase.functions.invoke('notification-digest', { body: { preview: true, mode } })
      if (error) { toast.error(error.message || 'Preview failed'); setPreviewOpen(false); return }
      if (data?.error) { toast.error(data.error); setPreviewOpen(false); return }
      setPreviewHtml(String(data?.html || ''))
      setPreviewCount(Number(data?.count || 0))
    } catch (e: any) {
      toast.error(e?.message || 'Preview failed')
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  if (authLoading || !prefs) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
  }

  const pausedUntil = prefs.paused_until ? new Date(prefs.paused_until as string) : null
  const isPaused = pausedUntil && pausedUntil.getTime() > Date.now()

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6" data-testid="notification-settings-page">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-2"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-7 w-7 text-[#1A4331]" /> Notification settings
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">Choose how you&apos;d like to hear from us. Changes save automatically.</p>
      </div>

      <Card className={isPaused ? 'border-amber-400 bg-amber-50' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BellOff className="h-4 w-4" /> Pause all notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPaused ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#7A5A1C]">Paused until <strong>{pausedUntil?.toLocaleString()}</strong>.</p>
              <Button size="sm" variant="outline" onClick={clearPause} data-testid="notif-resume">Resume now</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => pauseFor(1)}   data-testid="notif-pause-1h">Pause 1 hour</Button>
              <Button size="sm" variant="outline" onClick={() => pauseFor(8)}   data-testid="notif-pause-8h">Pause 8 hours</Button>
              <Button size="sm" variant="outline" onClick={() => pauseFor(24)}  data-testid="notif-pause-24h">Pause 24 hours</Button>
              <Button size="sm" variant="outline" onClick={() => pauseFor(168)} data-testid="notif-pause-7d">Pause 7 days</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Email delivery mode</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-[#5C5C5C] mb-3">Keep your inbox calm — get emails instantly, or rolled up into a single summary.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { v: 'instant', label: 'Instant',  help: 'Email as soon as something happens.' },
              { v: 'daily',   label: 'Daily',    help: 'One summary each morning at 8am.' },
              { v: 'weekly',  label: 'Weekly',   help: 'One summary every Sunday morning.' },
            ] as const).map(o => {
              const active = (prefs.digest_mode || 'instant') === o.v
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPref('digest_mode', o.v)}
                  disabled={saving === 'digest_mode'}
                  data-testid={`digest-${o.v}`}
                  className={`text-left rounded-lg border p-3 transition-colors ${active ? 'border-[#1A4331] bg-[#E8F0EC] ring-1 ring-[#1A4331]' : 'border-[#E5E3DB] hover:border-[#1A4331]'}`}
                >
                  <p className={`text-sm font-medium ${active ? 'text-[#1A4331]' : 'text-[#1A1A1A]'}`}>{o.label}</p>
                  <p className="text-xs text-[#5C5C5C] mt-1">{o.help}</p>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-[#8A8A8A] mt-3">Applies to every topic where you&apos;ve turned email ON. Bell (in-app) alerts are always instant.</p>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#F2F0EB]">
            <p className="text-xs text-[#5C5C5C]">Want to see it first?</p>
            <Button size="sm" variant="outline" onClick={() => openPreview('daily')} data-testid="preview-daily-button">
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview daily
            </Button>
            <Button size="sm" variant="outline" onClick={() => openPreview('weekly')} data-testid="preview-weekly-button">
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview weekly
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Preview — {previewMode === 'weekly' ? 'Weekly' : 'Daily'} digest</DialogTitle>
            <DialogDescription>
              {previewLoading ? 'Rendering…' : (
                previewCount === 0
                  ? 'No activity to roll up right now — here’s what an empty digest looks like.'
                  : `Showing ${previewCount} event${previewCount === 1 ? '' : 's'} from the last ${previewMode === 'weekly' ? '7 days' : '24 hours'}.`
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-[400px] border border-[#E5E3DB] rounded-lg overflow-hidden bg-white" data-testid="digest-preview-frame">
            {previewLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
            ) : (
              <iframe srcDoc={previewHtml} className="w-full h-full" style={{ minHeight: 400 }} title="Digest preview" sandbox="" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Per-topic preferences</CardTitle></CardHeader>
        <CardContent className="divide-y divide-[#F2F0EB]">
          {KINDS.map(k => (
            <div key={k.key} className="py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A]">{k.title}</p>
                <p className="text-xs text-[#5C5C5C] mt-0.5">{k.description}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <ToggleRow label="In-app" icon={<Bell className="h-4 w-4" />} value={!!prefs[`inapp_${k.key}`]} onChange={(v) => setPref(`inapp_${k.key}`, v)} saving={saving === `inapp_${k.key}`} testId={`toggle-inapp-${k.key}`} />
                <ToggleRow label="Email"  icon={<Mail className="h-4 w-4" />} value={!!prefs[`email_${k.key}`]} onChange={(v) => setPref(`email_${k.key}`, v)} saving={saving === `email_${k.key}`} testId={`toggle-email-${k.key}`} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ToggleRow({ label, icon, value, onChange, saving, testId }: { label: string; icon: React.ReactNode; value: boolean; onChange: (v: boolean) => void; saving: boolean; testId: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none" title={label}>
      <span className="flex items-center gap-1 text-xs text-[#5C5C5C] w-14">{icon} {label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        disabled={saving}
        data-testid={testId}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-[#1A4331]' : 'bg-[#C9C4B5]'} ${saving ? 'opacity-50' : ''}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}
