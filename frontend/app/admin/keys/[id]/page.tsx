'use client'

// Admin single-key detail: QR preview, full audit trail, actions
// (mark lost / retire / reactivate / re-label).

import { useEffect, useState, use as unwrap } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  KeyRound, ChevronLeft, AlertTriangle, Archive, RotateCcw, Printer, Save, Loader2, User, MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { type Key, type KeyEvent, keyUrl, qrDataUrl, statusTone, fmtDateTime } from '@/lib/keys'

export default function AdminKeyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = unwrap(params)
  const router = useRouter()
  const supabase = createClient()
  const [key, setKey] = useState<Key | null>(null)
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [qr, setQr] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'lost' | 'retired' | 'reactivated' | 'relabel'>(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => { fetchAll() /* eslint-disable-next-line */ }, [id])

  async function fetchAll() {
    const [kRes, eRes] = await Promise.all([
      supabase.from('keys')
        .select(`*,
          client:profiles!keys_client_id_fkey(full_name, email, phone),
          current_holder:profiles!keys_current_holder_id_fkey(full_name, role)`)
        .eq('id', id).maybeSingle(),
      supabase.from('key_events').select('*').eq('key_id', id).order('created_at', { ascending: false }),
    ])
    const k = kRes.data as Key | null
    setKey(k)
    setEvents((eRes.data as KeyEvent[]) || [])
    if (k) {
      setEditLabel(k.label)
      setQr(await qrDataUrl(keyUrl(k.qr_token)))
    }
    setLoading(false)
  }

  async function action(ev: 'lost' | 'retired' | 'reactivated') {
    if (!key) return
    const labels = { lost: 'mark this key LOST', retired: 'retire this key', reactivated: 'reactivate this key' }
    if (!confirm(`Are you sure you want to ${labels[ev]}?`)) return
    setBusy(ev)
    try {
      const { error } = await supabase.rpc('record_key_event', {
        p_key_id: key.id, p_event_type: ev,
        p_note: null, p_geo_lat: null, p_geo_lng: null, p_user_agent: navigator.userAgent.slice(0, 200),
      })
      if (error) { toast.error(error.message); return }
      toast.success('Updated')
      fetchAll()
    } finally { setBusy(null) }
  }

  async function relabel() {
    if (!key || !editLabel.trim() || editLabel === key.label) return
    setBusy('relabel')
    try {
      const { error: uErr } = await supabase.from('keys').update({ label: editLabel.trim(), updated_at: new Date().toISOString() }).eq('id', key.id)
      if (uErr) { toast.error(uErr.message); return }
      await supabase.rpc('record_key_event', {
        p_key_id: key.id, p_event_type: 'relabelled',
        p_note: `"${key.label}" → "${editLabel.trim()}"`,
        p_geo_lat: null, p_geo_lng: null, p_user_agent: navigator.userAgent.slice(0, 200),
      })
      toast.success('Re-labelled')
      fetchAll()
    } finally { setBusy(null) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
    </div>
  )
  if (!key) return (
    <div className="text-center py-20">
      <p className="text-[#8A8A8A]">Key not found.</p>
      <Link href="/admin/keys"><Button variant="outline" className="mt-3">Back to register</Button></Link>
    </div>
  )

  return (
    <div className="space-y-6" data-testid="admin-key-detail">
      <div className="print:hidden">
        <Link href="/admin/keys" className="inline-flex items-center text-sm text-[#5C5C5C] hover:text-[#1A4331]">
          <ChevronLeft className="h-4 w-4" /> Back to Keys
        </Link>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* QR + meta */}
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-xl bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center">
              <KeyRound className="h-6 w-6" />
            </div>
            {qr && <img src={qr} alt="QR" className="w-48 h-48" />}
            <p className="font-heading text-lg font-bold">{key.label}</p>
            <p className="text-xs font-mono text-[#8A8A8A] break-all">{key.qr_token}</p>
            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusTone(key.status)}`}>
              {key.status.toUpperCase()}
            </span>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden" data-testid="print-qr">
              <Printer className="h-4 w-4 mr-1" /> Print sticker
            </Button>
          </CardContent>
        </Card>

        {/* Details + actions */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8A8A8A]">Client</p>
                <p className="font-medium flex items-center gap-2"><User className="h-4 w-4 text-[#5C5C5C]" />{key.client?.full_name || key.client?.email}</p>
                <p className="text-xs text-[#8A8A8A]">{key.client?.email} · {key.client?.phone}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8A8A8A]">Current holder</p>
                <p className="font-medium">
                  {key.current_holder_id
                    ? <>{key.current_holder?.full_name} <span className="text-xs text-[#8A8A8A] capitalize">({key.current_holder_role})</span></>
                    : <span className="text-[#1A4331]">In safe</span>}
                </p>
                <p className="text-xs text-[#8A8A8A]">Last event {fmtDateTime(key.last_event_at)}</p>
              </div>
              {key.notes && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8A8A8A]">Staff notes</p>
                  <p className="text-sm text-[#5C5C5C] whitespace-pre-wrap">{key.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="print:hidden">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm font-semibold text-[#1A4331]">Actions</p>

              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px] space-y-1.5">
                  <Label>Re-label</Label>
                  <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} data-testid="relabel-input" />
                </div>
                <Button variant="outline" onClick={relabel} disabled={busy === 'relabel' || !editLabel.trim() || editLabel === key.label} data-testid="relabel-save">
                  {busy === 'relabel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#F2F0EB]">
                {key.status !== 'lost' && (
                  <Button variant="outline" onClick={() => action('lost')} disabled={!!busy} className="text-[#E06D53] border-[#E06D53]/30 hover:bg-[#FDEDEA]" data-testid="mark-lost">
                    <AlertTriangle className="h-4 w-4 mr-1" /> Mark lost
                  </Button>
                )}
                {key.status !== 'retired' && (
                  <Button variant="outline" onClick={() => action('retired')} disabled={!!busy} data-testid="retire-key">
                    <Archive className="h-4 w-4 mr-1" /> Retire
                  </Button>
                )}
                {key.status !== 'active' && (
                  <Button variant="outline" onClick={() => action('reactivated')} disabled={!!busy} data-testid="reactivate-key">
                    <RotateCcw className="h-4 w-4 mr-1" /> Reactivate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Audit trail */}
      <Card>
        <CardContent className="p-6">
          <p className="font-heading text-lg font-semibold mb-3">Audit trail ({events.length})</p>
          <div className="space-y-2">
            {events.length === 0 && <p className="text-sm text-[#8A8A8A]">No events yet.</p>}
            {events.map(e => <EventRow key={e.id} e={e} />)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EventRow({ e }: { e: KeyEvent }) {
  const tone: Record<string, string> = {
    created: 'bg-[#E8F0EC] text-[#1A4331]',
    pickup:  'bg-[#FDF8EF] text-[#DDA74F]',
    dropoff: 'bg-[#E8F0EC] text-[#1A4331]',
    viewed:  'bg-[#F2F0EB] text-[#5C5C5C]',
    lost:    'bg-[#FDEDEA] text-[#E06D53]',
    retired: 'bg-[#F2F0EB] text-[#8A8A8A]',
    reactivated: 'bg-[#E8F0EC] text-[#1A4331]',
    relabelled: 'bg-[#F2F0EB] text-[#5C5C5C]',
  }
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-[#F2F0EB]">
      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${tone[e.event_type] || 'bg-[#F2F0EB]'}`}>
        {e.event_type}
      </span>
      <div className="flex-1 min-w-0 text-sm">
        <p className="text-[#1A1A1A]">
          {e.actor_name || '—'}{' '}
          <span className="text-[#8A8A8A] text-xs capitalize">({e.actor_role || '—'})</span>
        </p>
        {e.note && <p className="text-xs text-[#5C5C5C]">{e.note}</p>}
        <p className="text-xs text-[#8A8A8A] mt-0.5 flex items-center gap-3 flex-wrap">
          <span>{fmtDateTime(e.created_at)}</span>
          {e.geo_lat != null && e.geo_lng != null && (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.geo_lat.toFixed(3)}, {e.geo_lng.toFixed(3)}</span>
          )}
        </p>
      </div>
    </div>
  )
}
