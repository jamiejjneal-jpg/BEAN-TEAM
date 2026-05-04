'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { WALK_TYPES } from '@/lib/utils'
import { TrendingUp, Users, Calendar, Repeat, Award, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import * as XLSX from 'xlsx'

// Best-effort price extraction from the WALK_TYPES label "... — £X" or "(N dogs) — £X"
function priceOf(walkType: string): number {
  const wt = WALK_TYPES.find(w => w.value === walkType)
  if (!wt) return 0
  const match = wt.label.match(/£(\d+(?:\.\d{1,2})?)/)
  return match ? parseFloat(match[1]) : 0
}

type Booking = {
  id: string; client_id: string | null; walker_id: string | null
  walk_type: string; status: string; scheduled_date: string
  walker?: { full_name?: string | null } | null
}

export default function AnalyticsPage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, client_id, walker_id, walk_type, status, scheduled_date, walker:profiles!bookings_walker_id_fkey(full_name)')
        .order('scheduled_date', { ascending: false })
        .limit(2000)
      setBookings((data as any) || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  // ----- aggregations
  const completed = bookings.filter(b => ['completed', 'confirmed'].includes(b.status))
  const totalRevenue = completed.reduce((s, b) => s + priceOf(b.walk_type), 0)
  const last30Cutoff = new Date(); last30Cutoff.setDate(last30Cutoff.getDate() - 30)
  const last30 = completed.filter(b => new Date(b.scheduled_date) >= last30Cutoff)
  const last30Revenue = last30.reduce((s, b) => s + priceOf(b.walk_type), 0)

  // Revenue by service type
  const byService = new Map<string, { count: number; revenue: number; label: string }>()
  for (const b of completed) {
    const wt = WALK_TYPES.find(w => w.value === b.walk_type)
    const k = b.walk_type || 'unknown'
    const cur = byService.get(k) || { count: 0, revenue: 0, label: wt?.label || k }
    cur.count += 1
    cur.revenue += priceOf(b.walk_type)
    byService.set(k, cur)
  }
  const serviceList = Array.from(byService.values()).sort((a, b) => b.revenue - a.revenue)
  const maxServiceRev = Math.max(1, ...serviceList.map(s => s.revenue))

  // Repeat-booking rate
  const clientCounts = new Map<string, number>()
  for (const b of bookings) if (b.client_id) clientCounts.set(b.client_id, (clientCounts.get(b.client_id) || 0) + 1)
  const totalClients = clientCounts.size
  const repeatClients = Array.from(clientCounts.values()).filter(n => n > 1).length
  const repeatRate = totalClients > 0 ? Math.round((repeatClients / totalClients) * 100) : 0

  // Most-booked walker
  const walkerCounts = new Map<string, { name: string; count: number }>()
  for (const b of bookings.filter(x => x.walker_id)) {
    const k = b.walker_id!
    const cur = walkerCounts.get(k) || { name: b.walker?.full_name || 'Walker', count: 0 }
    cur.count += 1
    walkerCounts.set(k, cur)
  }
  const topWalker = Array.from(walkerCounts.values()).sort((a, b) => b.count - a.count)[0]

  // Peak booking days (day-of-week)
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dowCounts = [0, 0, 0, 0, 0, 0, 0]
  for (const b of bookings) {
    const d = new Date(b.scheduled_date).getDay()
    dowCounts[d] += 1
  }
  const maxDow = Math.max(1, ...dowCounts)

  // Monthly trend (last 6 months)
  const months: { label: string; count: number; revenue: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1)
    const start = new Date(d)
    const end = new Date(d); end.setMonth(end.getMonth() + 1)
    const slice = completed.filter(b => {
      const dt = new Date(b.scheduled_date); return dt >= start && dt < end
    })
    months.push({
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      count: slice.length,
      revenue: slice.reduce((s, b) => s + priceOf(b.walk_type), 0),
    })
  }
  const maxMonthRev = Math.max(1, ...months.map(m => m.revenue))

  const stats = [
    { label: 'Total revenue', value: `£${totalRevenue.toFixed(0)}`, sub: `£${last30Revenue.toFixed(0)} last 30 days`, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Bookings (all-time)', value: bookings.length.toString(), sub: `${last30.length} last 30 days`, icon: Calendar, color: 'bg-blue-50 text-blue-700' },
    { label: 'Repeat-booking rate', value: `${repeatRate}%`, sub: `${repeatClients}/${totalClients} clients`, icon: Repeat, color: 'bg-purple-50 text-purple-700' },
    { label: 'Top walker', value: topWalker?.name || '—', sub: topWalker ? `${topWalker.count} bookings` : 'No bookings yet', icon: Award, color: 'bg-amber-50 text-amber-700' },
  ]

  function exportToExcel() {
    const wb = XLSX.utils.book_new()

    // Sheet 1 — KPI summary
    const summary = [
      { Metric: 'Total revenue (£)', Value: totalRevenue.toFixed(2) },
      { Metric: 'Revenue last 30 days (£)', Value: last30Revenue.toFixed(2) },
      { Metric: 'Bookings (all-time)', Value: bookings.length },
      { Metric: 'Bookings last 30 days', Value: last30.length },
      { Metric: 'Repeat-booking rate (%)', Value: repeatRate },
      { Metric: 'Repeat clients', Value: `${repeatClients} / ${totalClients}` },
      { Metric: 'Top walker', Value: topWalker?.name || '—' },
      { Metric: 'Top walker bookings', Value: topWalker?.count || 0 },
      { Metric: 'Report date', Value: new Date().toLocaleDateString('en-GB') },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')

    // Sheet 2 — Revenue by service
    const serviceRows = Array.from(byService.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map(s => ({ 'Service': s.label, 'Bookings': s.count, 'Revenue (£)': s.revenue.toFixed(2) }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serviceRows), 'By Service')

    // Sheet 3 — Monthly trend
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(months.map(m => ({
      Month: m.label, Bookings: m.count, 'Revenue (£)': m.revenue.toFixed(2),
    }))), 'Monthly Trend')

    // Sheet 4 — Walker performance
    const walkerRows = Array.from(walkerCounts.values()).sort((a: any, b: any) => b.count - a.count)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(walkerRows.map((w: any) => ({ Walker: w.name, Bookings: w.count }))), 'Walkers')

    // Sheet 5 — Day-of-week distribution
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dows.map((d, i) => ({
      Day: d, Bookings: dowCounts[i],
    }))), 'Day of Week')

    const fname = `Rockys-Analytics-${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fname, { bookType: 'xlsx' })
  }

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-[#5C5C5C] mt-1">Revenue, bookings, walker performance — at a glance</p>
        </div>
        <Button variant="outline" onClick={exportToExcel} data-testid="export-analytics-excel">
          <Download className="h-4 w-4 mr-2" /> Export to Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className={`h-8 w-8 rounded-lg ${s.color} flex items-center justify-center mb-2`}><Icon className="h-4 w-4" /></div>
                <p className="text-xs text-[#8A8A8A]">{s.label}</p>
                <p className="text-lg font-heading font-bold">{s.value}</p>
                <p className="text-[10px] text-[#9C8E7A] mt-0.5">{s.sub}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by service</CardTitle>
            <CardDescription>Across all completed/confirmed bookings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {serviceList.length === 0 ? (
              <p className="text-sm text-[#8A8A8A] text-center py-6">No completed bookings yet</p>
            ) : serviceList.map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="truncate pr-2">{s.label}</span>
                  <span className="text-[#5C5C5C] shrink-0">£{s.revenue.toFixed(0)} <span className="text-[#9C8E7A]">· {s.count}</span></span>
                </div>
                <div className="h-2 rounded-full bg-[#F2F0EB] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#1A4331] to-[#3A6B53]" style={{ width: `${(s.revenue / maxServiceRev) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 6 months</CardTitle>
            <CardDescription>Revenue and booking volume month by month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-44 mb-2">
              {months.map(m => (
                <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="text-[10px] text-[#5C5C5C]">£{m.revenue.toFixed(0)}</div>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-[#1A4331] to-[#3A6B53]" style={{ height: `${Math.max(4, (m.revenue / maxMonthRev) * 140)}px` }} />
                  <div className="text-[10px] text-[#8A8A8A] font-medium">{m.label}</div>
                  <div className="text-[9px] text-[#9C8E7A]">{m.count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Peak booking days</CardTitle>
            <CardDescription>Which days of the week your customers prefer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-32">
              {dowCounts.map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="text-[11px] text-[#1A4331] font-bold">{c}</div>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-[#DDA74F] to-[#E8C57A]" style={{ height: `${Math.max(4, (c / maxDow) * 100)}px` }} />
                  <div className="text-[10px] text-[#5C5C5C] font-medium">{dows[i]}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
