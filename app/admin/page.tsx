'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Users, Dog, CalendarDays, MapPin, Clock, Mail, Loader2, Download, X } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDate, formatTime, BOOKING_STATUSES } from '@/lib/utils'
import { toast } from 'sonner'
import { exportClients, exportPets, exportBookings } from '@/lib/exports'
import { logAudit } from '@/lib/audit'
import { LastLoginCard } from '@/components/shared/LastLoginCard'
import { SpeciesBreakdownWidget } from '@/components/shared/SpeciesBreakdownWidget'
import BirthdayBanner from '@/components/shared/BirthdayBanner'

function initialsFrom(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function weekRange() {
  // Monday → Sunday of the current week
  const d = new Date()
  const day = d.getDay() // 0 Sun - 6 Sat
  const diffToMon = (day + 6) % 7
  const mon = new Date(d); mon.setDate(d.getDate() - diffToMon)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
}

export default function AdminDashboard() {
  const { profile, user } = useAuth()
  const [stats, setStats] = useState({ walkers: 0, clients: 0, bookings: 0, activeWalks: 0 })
  const [view, setView] = useState<'today' | 'week'>('today')
  const [walks, setWalks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingDigest, setSendingDigest] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<any>(null)
  const [cancelling, setCancelling] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchData() }, [view])

  async function fetchData() {
    setLoading(true)
    const rng = view === 'today'
      ? { from: todayISO(), to: todayISO() }
      : weekRange()

    const [walkersRes, clientsRes, bookingsRes, activeRes, walksRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'walker'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('bookings')
        .select('*, client:profiles!bookings_client_id_fkey(full_name, phone), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name)')
        .gte('scheduled_date', rng.from)
        .lte('scheduled_date', rng.to)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true }),
    ])

    setStats({
      walkers: walkersRes.count || 0,
      clients: clientsRes.count || 0,
      bookings: bookingsRes.count || 0,
      activeWalks: activeRes.count || 0,
    })
    setWalks(walksRes.data || [])
    setLoading(false)
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', cancelTarget.id)
    setCancelling(false)
    if (error) { toast.error('Cancel failed: ' + error.message); return }
    logAudit({ action: 'booking_cancelled', target_type: 'booking', target_id: cancelTarget.id,
      target_name: `${cancelTarget.dog?.name || 'walk'} on ${cancelTarget.scheduled_date}`, details: { by: 'admin-dashboard' } })
    toast.success('Booking cancelled')
    setCancelTarget(null)
    fetchData()
  }

  const statCards = [
    { label: 'Total Walkers', value: stats.walkers, icon: Users, color: 'bg-[#E8F0EC] text-[#1A4331]' },
    { label: 'Total Clients', value: stats.clients, icon: Dog, color: 'bg-amber-50 text-amber-700' },
    { label: 'Total Bookings', value: stats.bookings, icon: CalendarDays, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active Walks', value: stats.activeWalks, icon: MapPin, color: 'bg-emerald-50 text-emerald-700' },
  ]

  const greetingName = (profile?.full_name || '').trim().split(' ')[0] || 'there'

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <BirthdayBanner />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-[#E5E3DB] shadow-sm" data-testid="admin-avatar">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile?.full_name || 'avatar'} />}
            <AvatarFallback className="text-base sm:text-lg">{initialsFrom(profile?.full_name, user?.email)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Hi {greetingName} 👋</h1>
            <p className="text-[#5C5C5C] mt-1" data-testid="admin-login-email">
              {user?.email || profile?.email || ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              toast.loading('Preparing clients export...', { id: 'exp-clients' })
              try {
                await exportClients()
                toast.success('Clients exported', { id: 'exp-clients' })
              } catch (e: any) {
                toast.error(e.message || 'Export failed', { id: 'exp-clients' })
              }
            }}
            data-testid="export-clients-button"
          >
            <Download className="h-4 w-4 mr-2" /> Export Clients (.xlsx)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              toast.loading('Preparing pets export...', { id: 'exp-pets' })
              try {
                await exportPets()
                toast.success('Pets exported', { id: 'exp-pets' })
              } catch (e: any) {
                toast.error(e.message || 'Export failed', { id: 'exp-pets' })
              }
            }}
            data-testid="export-pets-button"
          >
            <Download className="h-4 w-4 mr-2" /> Export Pets (.xlsx)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              toast.loading('Preparing bookings export...', { id: 'exp-bk' })
              try {
                await exportBookings()
                toast.success('Bookings exported', { id: 'exp-bk' })
              } catch (e: any) {
                toast.error(e.message || 'Export failed', { id: 'exp-bk' })
              }
            }}
            data-testid="export-bookings-button"
          >
            <Download className="h-4 w-4 mr-2" /> Export Bookings (.xlsx)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setSendingDigest(true)
              try {
                const { data, error } = await supabase.functions.invoke('weekly-digest')
                if (error) toast.error(error.message || 'Failed to send digest')
                else if (data?.error) toast.error(data.error)
                else toast.success(`Digest sent · ${data.adminDigestSentTo} admin${data.adminDigestSentTo !== 1 ? 's' : ''}, ${data.clientDigestsSent} client${data.clientDigestsSent !== 1 ? 's' : ''}`)
              } catch (e: any) {
                toast.error(e.message || 'Network error')
              } finally {
                setSendingDigest(false)
              }
            }}
            disabled={sendingDigest}
            data-testid="send-weekly-digest-button"
          >
            {sendingDigest ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><Mail className="h-4 w-4 mr-2" /> Weekly report</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className={`animate-fade-in stagger-${i + 1}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#5C5C5C]">{stat.label}</p>
                  <p className="text-3xl font-heading font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {user && <LastLoginCard userId={user.id} />}

      <SpeciesBreakdownWidget />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#8EA396]" />
              {view === 'today' ? "Today's walks" : "This week's walks"}
            </CardTitle>
            <div className="inline-flex rounded-lg bg-[#F2F0EB] p-1 w-fit" data-testid="dashboard-view-toggle">
              <button
                onClick={() => setView('today')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'today' ? 'bg-white text-[#1A4331] shadow-sm' : 'text-[#5C5C5C] hover:text-[#1A1A1A]'}`}
                data-testid="view-today-button"
              >Today</button>
              <button
                onClick={() => setView('week')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'week' ? 'bg-white text-[#1A4331] shadow-sm' : 'text-[#5C5C5C] hover:text-[#1A1A1A]'}`}
                data-testid="view-week-button"
              >This week</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" /></div>
          ) : walks.length === 0 ? (
            <p className="text-sm text-[#8A8A8A] text-center py-8">No walks scheduled {view === 'today' ? 'today' : 'this week'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="dashboard-walks-table">
                <thead>
                  <tr className="border-b border-[#E5E3DB]">
                    <th className="text-left py-3 px-2 font-medium text-[#5C5C5C]">When</th>
                    <th className="text-left py-3 px-2 font-medium text-[#5C5C5C]">Client</th>
                    <th className="text-left py-3 px-2 font-medium text-[#5C5C5C]">Dog</th>
                    <th className="text-left py-3 px-2 font-medium text-[#5C5C5C]">Walker</th>
                    <th className="text-left py-3 px-2 font-medium text-[#5C5C5C]">Status</th>
                    <th className="text-right py-3 px-2 font-medium text-[#5C5C5C]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {walks.map((b) => {
                    const status = BOOKING_STATUSES[b.status as keyof typeof BOOKING_STATUSES]
                    const canCancel = b.status === 'pending' || b.status === 'confirmed'
                    return (
                      <tr key={b.id} className="border-b border-[#F2F0EB] last:border-0 hover:bg-[#F9F8F6]">
                        <td className="py-3 px-2 font-mono text-xs">{formatDate(b.scheduled_date)} {formatTime(b.scheduled_time)}</td>
                        <td className="py-3 px-2">{b.client?.full_name || <span className="italic text-[#9C8E7A]">Deleted client</span>}</td>
                        <td className="py-3 px-2">{b.dog?.name || <span className="italic text-[#9C8E7A]">Deleted dog</span>}</td>
                        <td className="py-3 px-2">{b.walker?.full_name || <span className="text-[#E06D53]">Unassigned</span>}</td>
                        <td className="py-3 px-2"><Badge className={status?.color}>{status?.label}</Badge></td>
                        <td className="py-3 px-2 text-right">
                          {canCancel ? (
                            <Button size="sm" variant="outline" onClick={() => setCancelTarget(b)} data-testid={`cancel-walk-${b.id}`} className="text-[#E06D53] border-[#E06D53]/40 hover:bg-[#FDEDEA]">
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                          ) : (
                            <span className="text-xs text-[#8A8A8A]">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#E06D53]">Cancel this walk?</DialogTitle>
            <DialogDescription>
              {cancelTarget && (<>
                {cancelTarget.dog?.name || 'Walk'} on <strong>{formatDate(cancelTarget.scheduled_date)}</strong> at {formatTime(cancelTarget.scheduled_time)}.
                The client and walker will see this as cancelled.
              </>)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>Keep it</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelling} data-testid="confirm-cancel-walk">
              {cancelling ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Cancelling…</> : 'Cancel walk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
