'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { getDayName } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Trash2, Clock } from 'lucide-react'

export default function WalkerSchedule() {
  const { user } = useAuth()
  const [schedule, setSchedule] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newDay, setNewDay] = useState('1')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('17:00')
  const supabase = createClient()

  useEffect(() => { if (user) fetchSchedule() }, [user])

  async function fetchSchedule() {
    const { data } = await supabase
      .from('walker_schedule')
      .select('*')
      .eq('walker_id', user!.id)
      .order('day_of_week')
    setSchedule(data || [])
    setLoading(false)
  }

  async function addSlot() {
    const { error } = await supabase.from('walker_schedule').insert({
      walker_id: user!.id,
      day_of_week: parseInt(newDay),
      start_time: newStart,
      end_time: newEnd,
    })
    if (error) { toast.error('Failed to add time slot'); return }
    toast.success('Schedule updated')
    fetchSchedule()
  }

  async function removeSlot(id: string) {
    await supabase.from('walker_schedule').delete().eq('id', id)
    toast.success('Slot removed')
    fetchSchedule()
  }

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const h = i.toString().padStart(2, '0')
    return [`${h}:00`, `${h}:30`]
  }).flat()

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  const grouped = Array.from({ length: 7 }, (_, day) => ({
    day,
    slots: schedule.filter(s => s.day_of_week === day),
  }))

  return (
    <div className="space-y-6" data-testid="walker-schedule-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Schedule</h1>
        <p className="text-[#5C5C5C] mt-1">Set your weekly availability</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Add Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Day</Label>
              <Select value={newDay} onValueChange={setNewDay}>
                <SelectTrigger className="w-40" data-testid="schedule-day-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>{getDayName(i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Select value={newStart} onValueChange={setNewStart}>
                <SelectTrigger className="w-28" data-testid="schedule-start-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Select value={newEnd} onValueChange={setNewEnd}>
                <SelectTrigger className="w-28" data-testid="schedule-end-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addSlot} data-testid="add-schedule-slot">Add Slot</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {grouped.map(({ day, slots }) => (
          <Card key={day} className={slots.length === 0 ? 'opacity-50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{getDayName(day)}</CardTitle>
            </CardHeader>
            <CardContent>
              {slots.length === 0 ? (
                <p className="text-xs text-[#8A8A8A]">Not available</p>
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div key={slot.id} className="flex items-center justify-between bg-[#E8F0EC] rounded-lg px-3 py-2">
                      <span className="text-sm font-mono flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-[#1A4331]" />
                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      </span>
                      <button onClick={() => removeSlot(slot.id)} className="text-[#E06D53] hover:text-[#C95A41]" data-testid={`remove-slot-${slot.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
