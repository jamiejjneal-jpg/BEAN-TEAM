'use client'

// Admin Keys Register
// - Live register: every key, current holder, since when
// - Filter by client / holder / status
// - Search bar
// - Print-friendly view
// - CSV export of register + full audit log
// - Create new key → generates QR, shows print sheet, emails client
// - Click a key → full audit trail + key actions

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  KeyRound, Plus, Printer, Download, Search, Mail, Eye, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  type Key, type KeyEvent,
  newKeyToken, keyUrl, qrDataUrl, statusTone, fmtDateTime,
} from '@/lib/keys'

export default function AdminKeysPage() {
  const supabase = createClient()
  const [keys, setKeys] = useState<Key[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<{ q: string; status: 'all' | Key['status']; holder: 'all' | 'safe' | 'walker' }>({
    q: '', status: 'all', holder: 'all',
  })
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ client_id: string; label: string; notes: string }>({
    client_id: '', label: 'Front door', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [justCreated, setJustCreated] = useState<{ key: Key; qr: string } | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [keyRes, clientRes] = await Promise.all([
      supabase.from('keys')
        .select(`*,
          client:profiles!keys_client_id_fkey(full_name, email, phone),
          current_holder:profiles!keys_current_holder_id_fkey(full_name, role)`)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'client').eq('is_active', true).order('full_name'),
    ])
    setKeys((keyRes.data as Key[]) || [])
    setClients(clientRes.data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase()
    return keys.filter(k => {
      if (filter.status !== 'all' && k.status !== filter.status) return false
      if (filter.holder === 'safe' && k.current_holder_id) return false
      if (filter.holder === 'walker' && !k.current_holder_id) return false
      if (!q) return true
      const hay = `${k.label} ${k.client?.full_name || ''} ${k.client?.email || ''} ${k.current_holder?.full_name || ''} ${k.qr_token}`.toLowerCase()
      return hay.includes(q)
    })
  }, [keys, filter])

  const counts = useMemo(() => ({
    total: keys.length,
    active: keys.filter(k => k.status === 'active').length,
    lost: keys.filter(k => k.status === 'lost').length,
    retired: keys.filter(k => k.status === 'retired').length,
    withWalker: keys.filter(k => k.status === 'active' && k.current_holder_id).length,
  }), [keys])

  async function createKey() {
    if (!form.client_id) { toast.error('Pick a client'); return }
    if (!form.label.trim()) { toast.error('Label required'); return }
    setSaving(true)
    try {
      const token = newKeyToken(24)
      const { data: { user } } = await supabase.auth.getUser()

      const { data: inserted, error } = await supabase.from('keys').insert({
        client_id: form.client_id,
        label: form.label.trim(),
        qr_token: token,
        status: 'active',
        notes: form.notes.trim() || null,
        created_by: user?.id || null,
      }).select(`*,
        client:profiles!keys_client_id_fkey(full_name, email, phone),
        current_holder:profiles!keys_current_holder_id_fkey(full_name, role)`).single()

      if (error) { toast.error('Save failed: ' + error.message); return }

      // Log a "created" audit event
      await supabase.from('key_events').insert({
        key_id: (inserted as any).id,
        event_type: 'created',
        actor_id: user?.id || null,
        actor_role: 'admin',
        actor_name: 'Admin',
        note: `Created for ${(inserted as any).client?.full_name || (inserted as any).client?.email || 'client'}`,
      })

      const qr = await qrDataUrl(keyUrl(token))
      setJustCreated({ key: inserted as Key, qr })

      // Email client with their QR (fire-and-forget; ignore errors so user flow isn't blocked)
      try {
        const client = (inserted as any).client as { full_name: string | null; email: string | null }
        if (client?.email) {
          const html = `
            <p>Hi ${(client.full_name || '').split(' ')[0] || 'there'},</p>
            <p>Great news — your key labelled <strong>${(inserted as any).label}</strong> is now on our secure key-tracking system.</p>
            <p>Any time one of our team takes or returns your key, you&apos;ll be able to see it on your dashboard at the <em>My Keys</em> page. Every handover is logged with a timestamp and who had the key.</p>
            <p>A printed QR sticker has been popped on your keyring — if you ever need to re-print it you can ask us any time.</p>
            <p>Thanks for trusting us with your key.</p>
            <p>— Rocky&apos;s Retreat and Rambles</p>`
          await supabase.functions.invoke('bulk-mail', {
            body: {
              subject: `Your key is now tracked — ${(inserted as any).label}`,
              html,
              recipients: [{ email: client.email, full_name: client.full_name || '' }],
              audit_name: `[KEY] Created for ${client.email}`,
            },
          })
        }
      } catch (e) { /* best-effort */ }

      setCreating(false)
      setForm({ client_id: '', label: 'Front door', notes: '' })
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  function exportRegisterCsv() {
    const rows = [
      ['Label', 'Client', 'Client email', 'Client phone', 'Status', 'Current holder', 'Holder role', 'Last event', 'QR token', 'Created'],
      ...filtered.map(k => [
        k.label,
        k.client?.full_name || '',
        k.client?.email || '',
        k.client?.phone || '',
        k.status,
        k.current_holder?.full_name || 'In safe',
        k.current_holder?.role || '',
        k.last_event_at || '',
        k.qr_token,
        k.created_at,
      ]),
    ]
    downloadCsv('key_register.csv', rows)
  }

  async function exportAuditCsv() {
    const { data } = await supabase.from('key_events')
      .select('*, key:keys(label, qr_token, client:profiles!keys_client_id_fkey(full_name, email))')
      .order('created_at', { ascending: false })
    const evs = (data as any[]) || []
    const rows = [
      ['When', 'Key label', 'Client', 'Event', 'Actor', 'Actor role', 'Note', 'Lat', 'Lng', 'User agent'],
      ...evs.map(e => [
        e.created_at,
        e.key?.label || '',
        e.key?.client?.full_name || e.key?.client?.email || '',
        e.event_type,
        e.actor_name || '',
        e.actor_role || '',
        e.note || '',
        e.geo_lat ?? '',
        e.geo_lng ?? '',
        (e.user_agent || '').slice(0, 100),
      ]),
    ]
    downloadCsv('key_audit_log.csv', rows)
  }

  function printRegister() { window.print() }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
    </div>
  )

  return (
    <div className="space-y-6" data-testid="admin-keys-page">
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="h-7 w-7 text-[#1A4331]" /> Keys Register
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">
            Every client key we hold, live — scan the QR on any key to log a pickup or dropoff in seconds.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={printRegister} data-testid="print-register"><Printer className="h-4 w-4 mr-1" /> Print register</Button>
          <Button variant="outline" onClick={exportRegisterCsv} data-testid="export-register"><Download className="h-4 w-4 mr-1" /> CSV register</Button>
          <Button variant="outline" onClick={exportAuditCsv} data-testid="export-audit"><Download className="h-4 w-4 mr-1" /> Full audit log</Button>
          <Button onClick={() => setCreating(true)} data-testid="new-key"><Plus className="h-4 w-4 mr-1" /> New key</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
        <Stat label="Total" value={counts.total} tone="neutral" />
        <Stat label="Active" value={counts.active} tone="green" />
        <Stat label="With a walker" value={counts.withWalker} tone="amber" />
        <Stat label="Lost" value={counts.lost} tone="red" />
        <Stat label="Retired" value={counts.retired} tone="neutral" />
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4 grid md:grid-cols-[1fr_200px_200px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
            <Input
              placeholder="Search by label, client, holder…"
              value={filter.q}
              onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
              className="pl-9"
              data-testid="filter-search"
            />
          </div>
          <Select value={filter.status} onValueChange={v => setFilter(f => ({ ...f, status: v as any }))}>
            <SelectTrigger data-testid="filter-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.holder} onValueChange={v => setFilter(f => ({ ...f, holder: v as any }))}>
            <SelectTrigger data-testid="filter-holder"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All holders</SelectItem>
              <SelectItem value="safe">In safe</SelectItem>
              <SelectItem value="walker">With a walker</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Register table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9F8F6] text-left text-[#5C5C5C] text-xs uppercase tracking-wide">
                  <th className="p-3">Label</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Current holder</th>
                  <th className="p-3">Last event</th>
                  <th className="p-3 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td className="p-6 text-center text-[#8A8A8A]" colSpan={6}>No keys match your filters.</td></tr>
                )}
                {filtered.map(k => (
                  <tr key={k.id} className="border-t border-[#F2F0EB]" data-testid={`key-row-${k.qr_token}`}>
                    <td className="p-3 font-medium">{k.label}</td>
                    <td className="p-3">
                      <div>{k.client?.full_name || '(unknown)'}</div>
                      <div className="text-xs text-[#8A8A8A]">{k.client?.email}</div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusTone(k.status)}`}>
                        {k.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">
                      {k.current_holder_id
                        ? <><strong>{k.current_holder?.full_name || 'Held'}</strong><div className="text-xs text-[#8A8A8A] capitalize">{k.current_holder_role}</div></>
                        : <span className="text-[#1A4331]">In safe</span>}
                    </td>
                    <td className="p-3 text-[#5C5C5C]">{fmtDateTime(k.last_event_at || k.created_at)}</td>
                    <td className="p-3 print:hidden">
                      <Link href={`/admin/keys/${k.id}`}>
                        <Button size="sm" variant="outline" data-testid={`view-key-${k.qr_token}`}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New key dialog */}
      <Dialog open={creating} onOpenChange={v => !saving && setCreating(v)}>
        <DialogContent data-testid="new-key-dialog">
          <DialogHeader>
            <DialogTitle>New key</DialogTitle>
            <DialogDescription>
              Generates a unique QR tag, logs it to the audit trail, and emails the client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                <SelectTrigger data-testid="k-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Front door, Back gate" data-testid="k-label" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any details only staff should see" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>Cancel</Button>
            <Button onClick={createKey} disabled={saving || !form.client_id || !form.label.trim()} data-testid="k-save">
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> : <><Plus className="h-4 w-4 mr-1" /> Create & email client</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-create QR sheet */}
      <Dialog open={!!justCreated} onOpenChange={() => setJustCreated(null)}>
        <DialogContent className="max-w-lg" data-testid="qr-sheet">
          <DialogHeader>
            <DialogTitle>Key created — print the sticker</DialogTitle>
            <DialogDescription>
              Stick this on the keyring. Scanning it opens the secure key page.
            </DialogDescription>
          </DialogHeader>
          {justCreated && (
            <div className="flex flex-col items-center gap-3 py-4 print:py-0">
              <img src={justCreated.qr} alt="QR" className="w-56 h-56" />
              <p className="font-heading text-lg font-semibold">{justCreated.key.label}</p>
              <p className="text-sm text-[#5C5C5C]">{justCreated.key.client?.full_name || justCreated.key.client?.email}</p>
              <p className="text-[10px] font-mono text-[#8A8A8A]">{justCreated.key.qr_token}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustCreated(null)}>Close</Button>
            <Button onClick={() => window.print()} data-testid="qr-print"><Printer className="h-4 w-4 mr-1" /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          aside, nav, header, footer, .print\\:hidden { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'neutral' }) {
  const tones = {
    green: 'text-[#1A4331] bg-[#E8F0EC]',
    amber: 'text-[#DDA74F] bg-[#FDF8EF]',
    red: 'text-[#E06D53] bg-[#FDEDEA]',
    neutral: 'text-[#5C5C5C] bg-[#F2F0EB]',
  }
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-[#8A8A8A]">{label}</p>
        <p className={`text-2xl font-heading font-bold mt-1 inline-block px-3 py-0.5 rounded-lg ${tones[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: any) => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const csv = rows.map(r => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
