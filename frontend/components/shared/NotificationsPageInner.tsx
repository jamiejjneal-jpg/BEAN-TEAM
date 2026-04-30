'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCheck, Calendar, Camera, MessageSquare, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const iconByType: Record<string, any> = {
  booking: Calendar, photo: Camera, message: MessageSquare, alert: AlertCircle,
}

function formatAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-GB')
}

export function NotificationsPageInner() {
  const { user } = useAuth()
  const supabase = createClient()
  const [notifs, setNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(200)
    setNotifs((data as any[]) || [])
    setLoading(false)
  }
  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', user!.id).eq('read', false)
    toast.success('All marked as read'); fetchAll()
  }
  async function markRead(id: string) { await supabase.from('notifications').update({ read: true }).eq('id', id); fetchAll() }
  async function del(id: string) { await supabase.from('notifications').delete().eq('id', id); fetchAll() }

  const filtered = filter === 'unread' ? notifs.filter(n => !n.read) : notifs
  const unreadCount = notifs.filter(n => !n.read).length

  return (
    <div className="space-y-5" data-testid="notifications-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-[#5C5C5C] mt-1">{unreadCount} unread · {notifs.length} total</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} data-testid="mark-all-read">
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark all as read
          </Button>
        )}
      </div>
      <div className="flex gap-1 bg-[#F2F0EB] rounded-lg p-1 w-fit">
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f ? 'bg-white text-[#1A4331] shadow-sm' : 'text-[#5C5C5C]'}`}
            data-testid={`filter-${f}`}>
            {f === 'all' ? 'All' : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Bell className="h-10 w-10 mx-auto text-[#D1CFC6] mb-2" />
          <p className="text-[#8A8A8A]">{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const Icon = iconByType[n.type] || Bell
            return (
              <Card key={n.id} className={`hover:shadow-sm transition ${!n.read ? 'bg-[#E8F0EC]/30 border-[#1A4331]/20' : ''}`} data-testid={`notification-${n.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center ${!n.read ? 'bg-[#1A4331] text-white' : 'bg-[#F2F0EB] text-[#5C5C5C]'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{n.title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!n.read && <Badge variant="default" className="text-[9px]">new</Badge>}
                          <p className="text-[10px] text-[#9C8E7A] whitespace-nowrap">{formatAgo(n.created_at)}</p>
                        </div>
                      </div>
                      <p className="text-sm text-[#5C5C5C] mt-0.5">{n.message}</p>
                      <div className="flex gap-2 mt-2">
                        {!n.read && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markRead(n.id)}>Mark read</Button>}
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#E06D53]" onClick={() => del(n.id)} data-testid={`delete-${n.id}`}>
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
