'use client'

// Admin → Clients → Import
// Step 1: paste CSV (or upload .csv) → Parse
// Step 2: review preview table; tweak rows; uncheck rows to skip
// Step 3: optionally send a "set your password" invite email
// Step 4: submit; show per-row results.

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Users, CheckCircle, AlertTriangle, ChevronLeft, Loader2, Download, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

type Row = {
  selected: boolean
  email: string
  full_name: string
  phone: string
  address: string
  emergency_contact: string
  emergency_phone: string
  key_code: string
  notes: string
}

type ImportResult = {
  row: number; email: string; status: 'created' | 'exists' | 'error'; error?: string; user_id?: string
}

const HEADERS = [
  'email', 'full_name', 'phone', 'address',
  'emergency_contact', 'emergency_phone', 'key_code', 'notes',
] as const

const SAMPLE_CSV = `email,full_name,phone,address,emergency_contact,emergency_phone,key_code,notes
jane.doe@example.com,Jane Doe,07700 900123,12 Park Lane London W1,John Doe,07700 900124,KEY-001,Two dogs Buddy and Bella
mark.smith@example.com,Mark Smith,07700 900200,9 High St Oxford OX1,Sue Smith,07700 900201,,Allergic to chicken treats`

export default function AdminImportClientsPage() {
  const [csv, setCsv] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [sendInvite, setSendInvite] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)

  function parseCsv() {
    if (!csv.trim()) { toast.error('Paste some CSV first'); return }
    const parsed = parseCsvText(csv)
    if (parsed.length === 0) { toast.error('No valid rows found'); return }
    setRows(parsed.map(r => ({ ...r, selected: !!r.email })))
    setResults(null)
    toast.success(`Parsed ${parsed.length} row${parsed.length === 1 ? '' : 's'}`)
  }

  function setCell(i: number, key: keyof Row, val: string | boolean) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  }

  async function submit() {
    const toSend = rows.filter(r => r.selected && r.email.trim())
    if (toSend.length === 0) { toast.error('Select at least one row'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/srv/admin/clients/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: toSend.map(({ selected, ...r }) => r),
          send_invite: sendInvite,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.message || data?.error || 'Import failed'); return }
      setResults(data.results || [])
      const s = data.summary
      toast.success(`Created ${s.created} · Existing ${s.existed} · Failed ${s.failed}`)
    } catch (e: any) {
      toast.error(e?.message || 'Network error')
    } finally { setSubmitting(false) }
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'clients_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function readFile(file: File) {
    const text = await file.text()
    setCsv(text)
    setTimeout(parseCsv, 50) // let state settle, then parse with the new csv
  }

  return (
    <div className="space-y-6" data-testid="import-clients-page">
      <Link href="/admin/clients" className="inline-flex items-center text-sm text-[#5C5C5C] hover:text-[#1A4331]">
        <ChevronLeft className="h-4 w-4" /> Back to Clients
      </Link>

      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-7 w-7 text-[#1A4331]" /> Bulk import clients
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">
          Paste a spreadsheet column or upload a CSV. Each new client gets an email invite to set their password.
        </p>
      </div>

      {/* Step 1: input */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-heading text-lg font-semibold">1. Paste or upload CSV</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="dl-template"><Download className="h-4 w-4 mr-1" /> Template</Button>
              <label className="inline-flex items-center gap-1 text-sm bg-[#F2F0EB] hover:bg-[#E8E5DD] px-3 py-1.5 rounded-lg cursor-pointer border border-[#E5E3DB]">
                <Upload className="h-4 w-4" /> Upload .csv
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }} data-testid="upload-csv" />
              </label>
            </div>
          </div>
          <p className="text-xs text-[#8A8A8A]">
            Required column: <code className="bg-[#F2F0EB] px-1 rounded">email</code>. Optional: full_name, phone, address, emergency_contact, emergency_phone, key_code, notes.
          </p>
          <Textarea
            value={csv}
            onChange={e => setCsv(e.target.value)}
            placeholder={SAMPLE_CSV}
            rows={6}
            className="font-mono text-xs"
            data-testid="csv-textarea"
          />
          <Button onClick={parseCsv} data-testid="parse-csv"><Wand2 className="h-4 w-4 mr-1" /> Parse</Button>
        </CardContent>
      </Card>

      {/* Step 2: review */}
      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 flex items-center justify-between border-b border-[#F2F0EB]">
              <p className="font-heading text-lg font-semibold">2. Review &amp; edit ({rows.filter(r => r.selected).length} selected)</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendInvite} onChange={e => setSendInvite(e.target.checked)} className="rounded border-[#E5E3DB]" />
                Send password invite email
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F9F8F6] text-[#5C5C5C] uppercase tracking-wide">
                  <tr>
                    <th className="p-2 w-8"></th>
                    {HEADERS.map(h => <th key={h} className="p-2 text-left font-medium">{h.replace('_', ' ')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-[#F2F0EB]">
                      <td className="p-2">
                        <input type="checkbox" checked={r.selected} onChange={e => setCell(i, 'selected', e.target.checked)} data-testid={`row-select-${i}`} />
                      </td>
                      {HEADERS.map(h => (
                        <td key={h} className="p-1">
                          <input
                            type="text"
                            value={r[h]}
                            onChange={e => setCell(i, h, e.target.value)}
                            className="w-full bg-transparent px-1 py-0.5 rounded focus:bg-white focus:ring-1 focus:ring-[#1A4331]/30 outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-[#F2F0EB] flex justify-end">
              <Button onClick={submit} disabled={submitting} size="lg" data-testid="submit-import">
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing…</> : <><Users className="h-4 w-4 mr-1" /> Import {rows.filter(r => r.selected).length} clients</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: results */}
      {results && results.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="font-heading text-lg font-semibold">3. Results</p>
            <div className="space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" data-testid={`result-${i}`}>
                  {r.status === 'created' && <CheckCircle className="h-4 w-4 text-[#1A4331]" />}
                  {r.status === 'exists' && <CheckCircle className="h-4 w-4 text-[#DDA74F]" />}
                  {r.status === 'error' && <AlertTriangle className="h-4 w-4 text-[#E06D53]" />}
                  <span className="flex-1 min-w-0 truncate">{r.email}</span>
                  <span className="text-xs text-[#8A8A8A] capitalize">{r.status}{r.error ? ` — ${r.error}` : ''}</span>
                </div>
              ))}
            </div>
            <Link href="/admin/clients">
              <Button variant="outline" className="mt-3"><ChevronLeft className="h-4 w-4 mr-1" /> Back to Clients</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Tiny CSV parser — supports quoted fields with embedded commas and newlines.
function parseCsvText(text: string): Omit<Row, 'selected'>[] {
  const records: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length > 0) { cur.push(field); records.push(cur); cur = []; field = '' }
        if (c === '\r' && text[i + 1] === '\n') i++
      } else { field += c }
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); records.push(cur) }
  if (records.length === 0) return []

  const header = records[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows: Omit<Row, 'selected'>[] = []
  for (let i = 1; i < records.length; i++) {
    const r = records[i]
    if (r.every(v => v.trim() === '')) continue
    const obj: any = {}
    for (const h of HEADERS) {
      const idx = header.indexOf(h)
      obj[h] = idx >= 0 ? (r[idx] || '').trim() : ''
    }
    rows.push(obj)
  }
  return rows
}
