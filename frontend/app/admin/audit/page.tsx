'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  History, Search, RefreshCw, Loader2, UserPlus, UserMinus, UserCog, CalendarCheck, CalendarX,
  ImageIcon, PoundSterling, Dog, User, ShieldCheck, RotateCcw, Download, Printer,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import * as XLSX from 'xlsx'

type Row = {
  id: string
  created_at: string
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  target_name: string | null
  details: any
}

const ACTIONS: { key: string; label: string; icon: any; color: string }[] = [
  { key: 'admin_created', label: 'Admin created', icon: ShieldCheck, color: 'text-[#1A4331] bg-[#E8F0EC]' },
  { key: 'role_changed', label: 'Role changed', icon: UserCog, color: 'text-[#DDA74F] bg-[#FDF8EF]' },
  { key: 'user_deleted', label: 'User deleted', icon: UserMinus, color: 'text-[#E06D53] bg-[#FDEDEA]' },
  { key: 'walker_added', label: 'Walker added', icon: UserPlus, color: 'text-[#1A4331] bg-[#E8F0EC]' },
  { key: 'walker_updated', label: 'Walker updated', icon: UserCog, color: 'text-[#5C5C5C] bg-[#F2F0EB]' },
  { key: 'client_added', label: 'Client added', icon: UserPlus, color: 'text-[#1A4331] bg-[#E8F0EC]' },
  { key: 'client_updated', label: 'Client updated', icon: UserCog, color: 'text-[#5C5C5C] bg-[#F2F0EB]' },
  { key: 'dog_updated', label: 'Dog updated', icon: Dog, color: 'text-[#5C5C5C] bg-[#F2F0EB]' },
  { key: 'dog_deactivated', label: 'Dog removed', icon: Dog, color: 'text-[#E06D53] bg-[#FDEDEA]' },
  { key: 'booking_approved', label: 'Booking approved', icon: CalendarCheck, color: 'text-[#2D7A5D] bg-[#E8F0EC]' },
  { key: 'booking_rejected', label: 'Booking rejected', icon: CalendarX, color: 'text-[#E06D53] bg-[#FDEDEA]' },
  { key: 'booking_created', label: 'Booking created', icon: CalendarCheck, color: 'text-[#1A4331] bg-[#E8F0EC]' },
  { key: 'booking_cancelled', label: 'Booking cancelled', icon: CalendarX, color: 'text-[#E06D53] bg-[#FDEDEA]' },
  { key: 'booking_rescheduled', label: 'Booking rescheduled', icon: CalendarCheck, color: 'text-[#2D7A5D] bg-[#E8F0EC]' },
  { key: 'booking_reassigned', label: 'Booking reassigned', icon: UserCog, color: 'text-[#2D7A5D] bg-[#E8F0EC]' },
  { key: 'dog_added', label: 'Dog added', icon: Dog, color: 'text-[#1A4331] bg-[#E8F0EC]' },
  { key: 'payout_marked_paid', label: 'Payout paid', icon: PoundSterling, color: 'text-[#2D7A5D] bg-[#E8F0EC]' },
  { key: 'payout_reversed', label: 'Payout reversed', icon: RotateCcw, color: 'text-[#DDA74F] bg-[#FDF8EF]' },
  { key: 'site_image_updated', label: 'Site image updated', icon: ImageIcon, color: 'text-[#5C5C5C] bg-[#F2F0EB]' },
  { key: 'site_image_reset', label: 'Site image reset', icon: ImageIcon, color: 'text-[#5C5C5C] bg-[#F2F0EB]' },
  { key: 'email_sent', label: 'Email sent', icon: User, color: 'text-[#1A4331] bg-[#E8F0EC]' },
  { key: 'booking_reminders_sent', label: 'Booking reminders', icon: User, color: 'text-[#1A4331] bg-[#E8F0EC]' },
]
const ACTION_MAP = new Map(ACTIONS.map(a => [a.key, a]))

function relative(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }) } catch { return iso }
}

function describe(r: Row): string {
  const d = r.details || {}
  switch (r.action) {
    case 'role_changed': return `${r.target_name || 'user'}: ${d.from || '?'} → ${d.to || '?'}`
    case 'user_deleted': return `Deleted ${r.target_name || r.target_id}${d.role ? ` (${d.role})` : ''}`
    case 'admin_created':
    case 'walker_added':
    case 'client_added': return `${r.target_name}${d.email ? ` · ${d.email}` : ''}`
    case 'booking_approved': return `${r.target_name}${d.admin_note ? ` — note: ${d.admin_note}` : ''}`
    case 'booking_rejected': return `${r.target_name}${d.reject_reason ? ` — reason: ${d.reject_reason}` : ''}`
    case 'payout_marked_paid': return `${r.target_name} · £${Number(d.amount || 0).toFixed(2)} · ${d.walks || 0} walks`
    case 'payout_reversed': return `${r.target_name} · £${Number(d.amount || 0).toFixed(2)}`
    case 'email_sent': return `${r.target_name} · ${d.recipients_count || 0} recipient${d.recipients_count === 1 ? '' : 's'}${typeof d.failed === 'number' && d.failed > 0 ? ` · ${d.failed} failed` : ''}`
    case 'booking_reminders_sent': return `${r.target_name} · sent ${d.sent || 0}/${d.total || 0}${d.failed ? ` · ${d.failed} failed` : ''}`
    case 'booking_rescheduled': return `${r.target_name} · ${d.from || '?'} → ${d.to || '?'} (${d.shift_minutes > 0 ? '+' : ''}${d.shift_minutes || 0} min)`
    case 'booking_reassigned':  return `${r.target_name} · ${d.from_walker || '?'} → ${d.to_walker || '?'}`
    case 'site_image_updated':
    case 'site_image_reset':
    case 'dog_deactivated':
    case 'dog_updated':
    case 'walker_updated':
    case 'client_updated': return r.target_name || r.target_id || '—'
    default: return r.target_name || ''
  }
}

export default function AuditLogPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [q, setQ] = useState('')

  useEffect(() => { fetch() }, [])

  async function fetch() {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) console.warn('[audit] fetch failed', error.message)
    setRows((data as Row[]) || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    if (actionFilter !== 'all' && r.action !== actionFilter) return false
    if (q) {
      const term = q.toLowerCase()
      const hay = `${r.actor_name || ''} ${r.actor_email || ''} ${r.target_name || ''} ${r.action}`.toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })

  function buildRows() {
    return filtered.map(r => ({
      'When': r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '',
      'Action': ACTION_MAP.get(r.action)?.label || r.action,
      'Actor': r.actor_name || '',
      'Actor Email': r.actor_email || '',
      'Target': r.target_name || r.target_id || '',
      'Type': r.target_type || '',
      'Details': describe(r),
    }))
  }

  function exportExcel() {
    const data = buildRows()
    if (!data.length) { return }
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Log')
    XLSX.writeFile(wb, `rockys-audit-${new Date().toISOString().slice(0, 10)}.xlsx`, { bookType: 'xlsx' })
  }

  // Browser-native "Save as PDF" via the print dialog — no heavy PDF lib needed
  // and produces beautiful, paginated output for the current filter.
  function exportPdf() {
    const data = buildRows()
    if (!data.length) { return }
    const rowsHtml = data.map(r => `
      <tr>
        <td style="white-space:nowrap">${r['When']}</td>
        <td><strong>${r['Action']}</strong></td>
        <td>${r['Actor']}<br/><span style="color:#888;font-size:11px">${r['Actor Email']}</span></td>
        <td>${r['Target']}${r['Type'] ? ` <span style="color:#888;font-size:11px">(${r['Type']})</span>` : ''}</td>
        <td style="color:#444">${r['Details']}</td>
      </tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rocky's Retreat — Audit Log ${new Date().toISOString().slice(0, 10)}</title>
      <style>
        @media print { @page { size: A4 landscape; margin: 12mm; } }
        body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:12px;margin:0;padding:24px}
        h1{margin:0 0 6px;font-size:20px;color:#1A4331}
        h2{margin:0 0 18px;font-size:12px;color:#888;font-weight:normal}
        table{width:100%;border-collapse:collapse}
        th{background:#E8F0EC;color:#1A4331;text-align:left;padding:6px 8px;font-size:11px;border-bottom:2px solid #1A4331}
        td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
        tr:nth-child(even) td{background:#FAFAF7}
        .footer{margin-top:16px;color:#888;font-size:10px}
      </style></head><body>
      <h1>Rocky's Retreat and Rambles — Audit Log</h1>
      <h2>Generated ${new Date().toLocaleString()} · ${data.length} entries${actionFilter !== 'all' ? ` · filter: ${ACTION_MAP.get(actionFilter)?.label || actionFilter}` : ''}${q ? ` · search: "${q}"` : ''}</h2>
      <table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <div class="footer">Printed for Admin reference — this document was produced from the live audit log.</div>
      <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 200) })<\/script>
      </body></html>`
    const w = window.open('', '_blank', 'width=1024,height=720')
    if (!w) { return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  return (
    <div className="space-y-6" data-testid="admin-audit-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-7 w-7 text-[#1A4331]" /> Audit Log
          </h1>
          <p className="text-[#5C5C5C] mt-1 text-sm">Every admin action — user changes, bookings, payouts, site edits. Append-only.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetch} disabled={loading} data-testid="audit-refresh">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Refreshing</> : <><RefreshCw className="h-4 w-4 mr-2" /> Refresh</>}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 -mt-2">
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={loading || filtered.length === 0} data-testid="audit-export-excel">
          <Download className="h-4 w-4 mr-2" /> Export Excel (.xlsx)
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={loading || filtered.length === 0} data-testid="audit-export-pdf">
          <Printer className="h-4 w-4 mr-2" /> Export PDF
        </Button>
        <span className="text-xs text-[#8A8A8A] self-center">Exports the <strong>currently-filtered</strong> entries.</span>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
            <Input
              placeholder="Search by person, target or action..."
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-9"
              data-testid="audit-search"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full sm:w-[220px]" data-testid="audit-action-filter">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map(a => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">
          Showing {filtered.length} of {rows.length} entries
        </CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-16 text-sm text-[#8A8A8A]">
              {rows.length === 0 ? 'No audit events yet. Actions will appear here as you manage the platform.' : 'No entries match your filters.'}
            </p>
          ) : (
            <ul className="divide-y divide-[#F2F0EB]">
              {filtered.map(r => {
                const meta = ACTION_MAP.get(r.action) || { label: r.action, icon: History, color: 'text-[#5C5C5C] bg-[#F2F0EB]' }
                const Icon = meta.icon
                return (
                  <li key={r.id} className="flex items-start gap-3 p-4 hover:bg-[#F9F8F6]" data-testid={`audit-row-${r.id}`}>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-sm">{meta.label}</span>
                        <Badge variant="secondary" className="text-[10px]">{r.action}</Badge>
                      </div>
                      <p className="text-sm text-[#3C3C3C] mt-0.5 break-words">{describe(r)}</p>
                      <p className="text-xs text-[#8A8A8A] mt-1 flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span className="font-medium">{r.actor_name || r.actor_email || 'system'}</span>
                        <span>·</span>
                        <span title={new Date(r.created_at).toLocaleString('en-GB')}>{relative(r.created_at)}</span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
