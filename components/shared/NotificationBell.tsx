'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { formatDate } from '@/lib/utils'

export default function NotificationBell() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    fetchNotifications()

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as any, ...prev])
        setUnreadCount(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  async function fetchNotifications() {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter((n: any) => !n.is_read).length)
    }
  }

  async function markAllRead() {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return (
    <div className="relative" data-testid="notification-bell">
      <button
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead() }}
        className="relative p-2 rounded-lg hover:bg-[#F2F0EB] transition-colors"
        data-testid="notification-bell-button"
      >
        <Bell className="h-5 w-5 text-[#5C5C5C]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-[#E06D53] text-white text-xs flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-[#E5E3DB] bg-white shadow-lg" data-testid="notification-dropdown">
            <div className="p-4 border-b border-[#E5E3DB] flex items-center justify-between">
              <h3 className="font-heading font-semibold text-sm">Notifications</h3>
              {notifications.length > 0 && (
                <button onClick={markAllRead} className="text-xs text-[#1A4331] hover:underline">Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-4 text-sm text-[#8A8A8A] text-center">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`p-3 border-b border-[#F2F0EB] last:border-0 ${!n.is_read ? 'bg-[#E8F0EC]/30' : ''}`}>
                    <p className="text-sm font-medium text-[#1A1A1A]">{n.title}</p>
                    <p className="text-xs text-[#5C5C5C] mt-0.5">{n.message}</p>
                    <p className="text-xs text-[#8A8A8A] mt-1 font-mono">{formatDate(n.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
