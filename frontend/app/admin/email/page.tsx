'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Mail, Send, Users, User, Loader2, Search, Check, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { EMAIL_TEMPLATES, type EmailTemplate } from '@/lib/email-templates'

type Person = { id: string; full_name: string | null; email: string; role: 'client' | 'walker' | 'admin' }

const GROUPS = [
  { key: 'all_clients', label: 'All active clients', icon: Users },
  { key: 'all_walkers', label: 'All active walkers', icon: Users },
  { key: 'all_users', label: 'All active users (clients + walkers)', icon: Users },
  { key: 'specific', label: 'Pick specific people', icon: User },
] as const
type GroupKey = typeof GROUPS[number]['key']

export default function AdminEmailPage() {
  const supabase = createClient()
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<GroupKey>('all_clients')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickerQuery, setPickerQuery] = useState('')
  const [templateKey, setTemplateKey] = useState<string>('welcome_client')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [sending, setSending] = useState(false)
  const [sentSummary, setSentSummary] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [autos, setAutos] = useState<Record<string, boolean>>({})
  const [togglingAuto, setTogglingAuto] = useState<string | null>(null)

  useEffect(() => { fetch(); fetchAutos() }, [])

  async function fetchAutos() {
    const { data } = await supabase.from('email_automations').select('template_key, enabled')
    const map: Record<string, boolean> = {}
    for (const r of (data as any[]) || []) map[r.template_key] = !!r.enabled
    setAutos(map)
  }

  async function toggleAuto(autoKey: string, next: boolean) {
    setTogglingAuto(autoKey)
    // Optimistic
    setAutos(prev => ({ ...prev, [autoKey]: next }))
    const { error } = await supabase.from('email_automations').upsert({
      template_key: autoKey, enabled: next, updated_at: new Date().toISOString(),
    }, { onConflict: 'template_key' })
    setTogglingAuto(null)
    if (error) {
      setAutos(prev => ({ ...prev, [autoKey]: !next }))
      toast.error('Failed to save toggle: ' + error.message)
      return
    }
    toast.success(next ? 'Automation turned ON' : 'Automation turned OFF')
  }

  async function saveAutoContent(autoKey: string) {
    setTogglingAuto(autoKey)
    const { error } = await supabase.from('email_automations').upsert({
      template_key: autoKey,
      subject_override: subject || null,
      html_override:    html    || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'template_key' })
    setTogglingAuto(null)
    if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success('Saved — the automation will use this subject & body from now on.')
  }

  async function runBookingReminderNow() {
    setTogglingAuto('booking_reminder')
    try {
      const { data, error } = await supabase.functions.invoke('booking-reminder')
      if (error) { toast.error(error.message); return }
      if (data?.error) { toast.error(data.error); return }
      if (data?.skipped) { toast.info(data.skipped); return }
      toast.success(`Reminders: sent ${data?.sent ?? 0}/${data?.total ?? 0}${data?.failed ? ` · ${data.failed} failed` : ''} for ${data?.date}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run')
    } finally {
      setTogglingAuto(null)
    }
  }

  async function fetch() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['client', 'walker'])
      .eq('is_active', true)
      .order('full_name')
    setPeople((data as Person[]) || [])
    setLoading(false)
  }

  function applyTemplate(key: string) {
    const t = EMAIL_TEMPLATES.find(x => x.key === key) as EmailTemplate | undefined
    if (!t) return
    setTemplateKey(key)
    setSubject(t.subject)
    setHtml(t.html)
  }
  useEffect(() => { applyTemplate(templateKey) /* eslint-disable-next-line */ }, [])

  const audience: Person[] = useMemo(() => {
    if (group === 'all_clients') return people.filter(p => p.role === 'client')
    if (group === 'all_walkers') return people.filter(p => p.role === 'walker')
    if (group === 'all_users')   return people
    return people.filter(p => picked.has(p.id))
  }, [group, people, picked])

  const filteredPicker = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return people
    return people.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      p.role.includes(q)
    )
  }, [pickerQuery, people])

  function togglePick(id: string) {
    setPicked(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  async function send() {
    if (!subject.trim()) { toast.error('Please enter a subject'); return }
    if (!html.trim())    { toast.error('Please enter a message'); return }
    if (audience.length === 0) { toast.error('No recipients selected'); return }

    const confirmMsg = `Send "${subject}" to ${audience.length} ${audience.length === 1 ? 'person' : 'people'}?`
    if (!window.confirm(confirmMsg)) return

    setSending(true); setSentSummary(null)
    try {
      const template = EMAIL_TEMPLATES.find(x => x.key === templateKey)
      const { data, error } = await supabase.functions.invoke('bulk-mail', {
        body: {
          subject,
          html,
          recipients: audience.map(p => ({ email: p.email, full_name: p.full_name || '' })),
          audit_name: template?.label ? `${template.label} — ${subject}` : subject,
        },
      })
      if (error) { toast.error(error.message || 'Send failed'); return }
      if (data?.error) { toast.error(data.error); return }
      setSentSummary({ sent: data?.sent || 0, failed: data?.failed || 0, total: data?.total || audience.length })
      if ((data?.failed || 0) === 0) toast.success(`Sent to ${data?.sent} recipient${data?.sent === 1 ? '' : 's'}`)
      else toast.warning(`Sent ${data?.sent}/${data?.total} · ${data?.failed} failed`)
    } catch (e: any) {
      toast.error(e?.message || 'Network error')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
  }

  return (
    <div className="space-y-6" data-testid="admin-email-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="h-7 w-7 text-[#1A4331]" /> Email Center
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">Send announcements, welcomes, reminders and heartfelt notes — one at a time or in bulk. Every send is written to the Audit Log.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">1. Choose a template</CardTitle></CardHeader>
            <CardContent>
              <Select value={templateKey} onValueChange={applyTemplate}>
                <SelectTrigger data-testid="email-template-select"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {EMAIL_TEMPLATES.map(t => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}{t.autoKey ? ' ⚡' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#8A8A8A] mt-2">Templates insert sensible defaults. Feel free to edit the subject and body — your version will be the one that sends. Templates marked ⚡ can be sent automatically on a trigger.</p>

              {(() => {
                const t = EMAIL_TEMPLATES.find(x => x.key === templateKey)
                if (!t?.autoKey) return null
                const on = !!autos[t.autoKey]
                return (
                  <div className={`mt-3 rounded-lg border p-3 ${on ? 'border-[#1A4331]/30 bg-[#E8F0EC]' : 'border-[#E5E3DB] bg-[#F9F8F6]'}`} data-testid={`auto-panel-${t.autoKey}`}>
                    <div className="flex items-start gap-3">
                      <Zap className={`h-5 w-5 shrink-0 mt-0.5 ${on ? 'text-[#1A4331]' : 'text-[#8A8A8A]'}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[#1A1A1A]">Auto-send this template</p>
                          <button
                            type="button"
                            onClick={() => toggleAuto(t.autoKey!, !on)}
                            disabled={togglingAuto === t.autoKey}
                            data-testid={`auto-toggle-${t.autoKey}`}
                            className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-[#1A4331]' : 'bg-[#C9C4B5]'} ${togglingAuto === t.autoKey ? 'opacity-50' : ''}`}
                            aria-pressed={on}
                          >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                        <p className="text-xs text-[#5C5C5C] mt-1">{t.autoDescription}</p>
                        <p className="text-xs text-[#8A8A8A] mt-1">
                          When {on ? <span className="text-[#1A4331] font-medium">ON</span> : 'OFF'}, this template&apos;s saved subject + body will be used for the automatic send. Edit the subject/message above then click <strong>Save</strong> below to update what gets auto-sent.
                        </p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => saveAutoContent(t.autoKey!)} disabled={togglingAuto === t.autoKey} data-testid={`auto-save-${t.autoKey}`}>
                          {togglingAuto === t.autoKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save auto-send content'}
                        </Button>
                        {t.autoKey === 'booking_reminder' && (
                          <Button size="sm" variant="outline" className="mt-2 ml-2" onClick={runBookingReminderNow} disabled={togglingAuto === 'booking_reminder'} data-testid="auto-run-booking-reminder">
                            {togglingAuto === 'booking_reminder' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run now (test)'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">2. Write the message</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="email-subject" placeholder="Subject line" />
              </div>
              <div className="space-y-2">
                <Label>Message (HTML supported — &lt;p&gt;, &lt;ul&gt;, &lt;strong&gt; etc.)</Label>
                <Textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={14} data-testid="email-html" className="font-mono text-xs" />
                <p className="text-xs text-[#8A8A8A]">A greeting with the recipient&apos;s first name is added automatically. Rocky&apos;s branding + footer are added too — you only need to write the middle.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border border-[#E5E3DB] overflow-hidden">
                <div className="bg-[#1A4331] text-white px-4 py-3 text-sm font-semibold">🐾 Rocky&apos;s Retreat and Rambles</div>
                <div className="p-4 bg-white">
                  <p className="text-xs text-[#8A8A8A] mb-2">Subject: <strong className="text-[#1A1A1A]">{subject || '(empty)'}</strong></p>
                  <div className="text-sm text-[#3C3C3C]"><p>Hi <em className="text-[#8A8A8A]">[recipient first name]</em>,</p></div>
                  <div className="text-sm text-[#3C3C3C] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html || '<p class="text-[#8A8A8A]">(empty)</p>' }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">3. Pick recipients</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={group} onValueChange={(v) => setGroup(v as GroupKey)}>
                <SelectTrigger data-testid="email-group-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUPS.map(g => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>

              {group === 'specific' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
                    <Input className="pl-9" placeholder="Search people..." value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} data-testid="email-people-search" />
                  </div>
                  <div className="border border-[#E5E3DB] rounded-lg max-h-72 overflow-y-auto bg-white">
                    {filteredPicker.length === 0 ? (
                      <p className="text-xs text-[#8A8A8A] p-3 text-center">No matches</p>
                    ) : filteredPicker.map(p => {
                      const isPicked = picked.has(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePick(p.id)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-b border-[#F2F0EB] last:border-0 ${isPicked ? 'bg-[#E8F0EC]' : 'hover:bg-[#F9F8F6]'}`}
                          data-testid={`email-pick-${p.id}`}
                        >
                          <div className={`h-4 w-4 rounded border ${isPicked ? 'bg-[#1A4331] border-[#1A4331]' : 'border-[#C9C4B5]'} flex items-center justify-center`}>
                            {isPicked && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-[#1A1A1A]">{p.full_name || '(no name)'}</p>
                            <p className="truncate text-xs text-[#8A8A8A]">{p.email}</p>
                          </div>
                          <Badge variant="secondary" className="text-[10px] capitalize">{p.role}</Badge>
                        </button>
                      )
                    })}
                  </div>
                  {picked.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())} className="w-full text-[#E06D53]">
                      <X className="h-3.5 w-3.5 mr-1" /> Clear {picked.size} selected
                    </Button>
                  )}
                </div>
              )}

              <div className="rounded-lg bg-[#F9F8F6] border border-[#E5E3DB] p-3 text-sm">
                <p className="font-medium text-[#1A4331]" data-testid="email-audience-count">
                  Will send to {audience.length} {audience.length === 1 ? 'person' : 'people'}
                </p>
                {audience.length > 0 && audience.length <= 10 && (
                  <p className="text-xs text-[#5C5C5C] mt-1">{audience.map(a => a.full_name || a.email).join(', ')}</p>
                )}
                {audience.length > 10 && (
                  <p className="text-xs text-[#5C5C5C] mt-1">Too many to list here — audit log keeps the full record.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button className="w-full" disabled={sending || audience.length === 0} onClick={send} data-testid="email-send-button">
                {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><Send className="h-4 w-4 mr-2" /> Send to {audience.length} recipient{audience.length === 1 ? '' : 's'}</>}
              </Button>
              {sentSummary && (
                <div className={`text-sm rounded-lg p-3 ${sentSummary.failed ? 'bg-[#FDF8EF] text-[#7A5A1C]' : 'bg-[#E8F0EC] text-[#1A4331]'}`} data-testid="email-send-summary">
                  Sent {sentSummary.sent}/{sentSummary.total}. {sentSummary.failed > 0 && `${sentSummary.failed} failed — see audit log.`}
                </div>
              )}
              <p className="text-xs text-[#8A8A8A]">Each send is recorded in the Audit Log (action: <code>email_sent</code>).</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
