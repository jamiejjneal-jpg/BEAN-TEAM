'use client'

// Workload heatmap — grid of walker × day showing booking load for the week.
// Coloured cells: deeper green = busier. Click a cell to jump-filter.
// Data comes from the same bookings query the calendar uses.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users2, Flame } from 'lucide-react'

function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const dow = x.getDay() // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow - 1 // Monday-based
  x.setDate(x.getDate() - back)
  return x
}

function iso(d: Date) { return d.toISOString().slice(0, 10) }

export function WorkloadHeatmap({ weekStart }: { weekStart?: Date }) {
  const supabase = createClient()
  const [walkers, setWalkers] = useState<{ id: string; name: string }[]>([])
  const [data, setData] = useState<Map<string, number>>(new Map()) // key = walker_id|date
  const [loading, setLoading] = useState(true)

  const monday = useMemo(() => weekStart ? startOfWeek(weekStart) : startOfWeek(new Date()), [weekStart])
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(d.getDate() + i); return d
    })
  }, [monday])
  const startIso = iso(days[0])
  const endIso = iso(days[6])

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [walkersRes, bookingsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name')
          .in('role', ['walker', 'admin']).eq('is_active', true).order('full_name'),
        supabase.from('bookings').select('walker_id, scheduled_date, status')
          .gte('scheduled_date', startIso).lte('scheduled_date', endIso)
          .in('status', ['pending', 'confirmed', 'in_progress', 'completed']),
      ])
      const wk = (walkersRes.data || []).map((w: any) => ({ id: w.id, name: w.full_name || 'Walker' }))
      const counts = new Map<string, number>()
      for (const b of bookingsRes.data || []) {
        if (!(b as any).walker_id) continue
        const k = `${(b as any).walker_id}|${(b as any).scheduled_date}`
        counts.set(k, (counts.get(k) || 0) + 1)
      }
      setWalkers(wk)
      setData(counts)
      setLoading(false)
    })()
  }, [startIso, endIso])

  const allCounts = Array.from(data.values())
  const max = Math.max(1, ...allCounts)

  function cellBg(count: number) {
    if (count === 0) return '#F9F8F6'
    const pct = Math.min(1, count / max)
    // Interpolate between pale green and Rocky dark green
    const r = Math.round(232 - (232 - 26) * pct)
    const g = Math.round(240 - (240 - 67) * pct)
    const b = Math.round(236 - (236 - 49) * pct)
    return `rgb(${r},${g},${b})`
  }

  function cellFg(count: number) {
    return count / max > 0.5 ? '#ffffff' : '#1A4331'
  }

  if (loading) {
    return <Card><CardContent className="py-10 text-center text-[#8A8A8A] text-sm">Loading workload…</CardContent></Card>
  }

  return (
    <Card data-testid="workload-heatmap">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4 text-[#E06D53]" /> Walker workload this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        {walkers.length === 0 ? (
          <p className="text-sm text-[#8A8A8A] py-6 text-center">No active walkers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1.5 pr-3 font-medium text-[#8A8A8A]">
                    <span className="inline-flex items-center gap-1"><Users2 className="h-3 w-3" /> Walker</span>
                  </th>
                  {days.map(d => (
                    <th key={d.toISOString()} className="text-center py-1.5 px-1 font-medium text-[#8A8A8A]">
                      <div>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                      <div className="text-[10px] text-[#9C8E7A] font-mono">{d.getDate()}</div>
                    </th>
                  ))}
                  <th className="text-center py-1.5 px-1 font-medium text-[#8A8A8A]">Total</th>
                </tr>
              </thead>
              <tbody>
                {walkers.map(w => {
                  const rowCounts = days.map(d => data.get(`${w.id}|${iso(d)}`) || 0)
                  const total = rowCounts.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={w.id} data-testid={`heat-row-${w.id}`}>
                      <td className="py-1 pr-3 font-medium text-[#1A1A1A] whitespace-nowrap">{w.name}</td>
                      {rowCounts.map((c, i) => (
                        <td key={i} className="p-0.5">
                          <div
                            className="rounded-md h-9 flex items-center justify-center font-mono text-[11px] font-semibold border border-[#E5E3DB]/50"
                            style={{ background: cellBg(c), color: cellFg(c) }}
                            title={`${w.name} · ${days[i].toLocaleDateString('en-GB')} · ${c} walk${c === 1 ? '' : 's'}`}
                          >
                            {c || ''}
                          </div>
                        </td>
                      ))}
                      <td className="text-center font-semibold text-[#1A4331]">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-[#8A8A8A]">
              <span>Quieter</span>
              <div className="flex gap-0.5">
                {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                  <div key={i} className="h-3 w-6 rounded-sm" style={{ background: cellBg(p * max) }} />
                ))}
              </div>
              <span>Busier</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
