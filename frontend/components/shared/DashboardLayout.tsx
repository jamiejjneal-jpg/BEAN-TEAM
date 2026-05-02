'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import NotificationBell from '@/components/shared/NotificationBell'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, CalendarDays, Dog, MapPin, Star,
  ClipboardList, Settings, LogOut, Menu, X, PawPrint, Camera, Shield, DollarSign, Activity, Image as ImageIcon, History, Printer, Mail, Bell, TrendingUp, Plane, Repeat, PackageOpen, Receipt
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { SiteFooter } from '@/components/shared/SiteFooter'

const profileHref = { admin: '/admin/profile', walker: '/walker/profile', client: '/client/profile' } as const

const navItems = {
  admin: [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/walkers', label: 'Walkers', icon: Users },
    { href: '/admin/clients', label: 'Clients', icon: Users },
    { href: '/admin/pets', label: 'Pets', icon: Dog },
    { href: '/admin/bookings', label: 'Bookings', icon: CalendarDays },
    { href: '/admin/recurring', label: 'Regular Walks', icon: Repeat },
    { href: '/admin/services', label: 'Services', icon: PackageOpen },
    { href: '/admin/invoices', label: 'Invoices', icon: Receipt },
    { href: '/admin/time-off', label: 'Time Off', icon: Plane },
    { href: '/admin/calendar', label: 'Weekly Calendar', icon: Printer },
    { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/admin/email', label: 'Email Center', icon: Mail },
    { href: '/admin/gallery', label: 'Gallery', icon: Camera },
    { href: '/admin/team', label: 'Team', icon: Shield },
    { href: '/admin/site-setup', label: 'Site Setup', icon: ImageIcon },
    { href: '/admin/audit', label: 'Audit Log', icon: History },
    { href: '/admin/health', label: 'Health', icon: Activity },
    { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  ],
  walker: [
    { href: '/walker', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/walker/walks', label: 'My Walks', icon: MapPin },
    { href: '/walker/calendar', label: 'Calendar', icon: Printer },
    { href: '/walker/schedule', label: 'Schedule', icon: CalendarDays },
    { href: '/walker/unavailability', label: 'Time Off', icon: Plane },
    { href: '/walker/profile', label: 'Profile', icon: Settings },
    { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  ],
  client: [
    { href: '/client', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/client/pets', label: 'My Pets', icon: Dog },
    { href: '/client/book', label: 'Book Walk', icon: MapPin },
    { href: '/client/recurring', label: 'Regular Walks', icon: Repeat },
    { href: '/client/bookings', label: 'My Bookings', icon: ClipboardList },
    { href: '/client/invoices', label: 'Invoices', icon: Receipt },
    { href: '/client/calendar', label: 'Calendar', icon: Printer },
    { href: '/client/gallery', label: 'Walk Gallery', icon: Camera },
    { href: '/client/walkers', label: 'Find Walkers', icon: Star },
    { href: '/pricing', label: 'Pricing', icon: DollarSign },
    { href: '/client/profile', label: 'Profile', icon: Settings },
    { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  ],
}

export default function DashboardLayout({
  children,
  role,
}: {
  children: React.ReactNode
  role: 'admin' | 'walker' | 'client'
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, loading, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadComments, setUnreadComments] = useState(0)
  const items = navItems[role]

  // Client-side route guard. Middleware doesn't run on the static CDN deploy,
  // so this is the UI layer of defence. Supabase RLS is the ultimate one.
  //
  // IMPORTANT: AuthProvider sets `loading=false` ONCE and only after
  // supabase.auth.getUser() + fetchProfile resolve. So when we see
  // `loading=false && !user`, the user really is signed-out — no race.
  // We use the plain Next router (soft replace). No location.replace fallback
  // because it raced AuthProvider hydration and bounced legit logins.
  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (profile && profile.role !== role) {
      const target = profile.role === 'admin' ? '/admin' : profile.role === 'walker' ? '/walker' : '/client'
      router.replace(target)
    }
  }, [loading, user, profile, role, router])

  // Poll for unread gallery comments (clients + walkers)
  useEffect(() => {
    if (!user || role === 'admin') return
    const key = `pawtrail-gallery-last-seen-${user.id}`
    const supabase = createClient()

    async function countUnread() {
      const lastSeen = localStorage.getItem(key) || new Date(0).toISOString()
      // Find walk_logs owned via their bookings where this user is client or walker
      const bookingField = role === 'client' ? 'client_id' : 'walker_id'
      const { data: bookings } = await supabase.from('bookings').select('id').eq(bookingField, user!.id)
      const bookingIds = (bookings || []).map((b: any) => b.id)
      if (bookingIds.length === 0) { setUnreadComments(0); return }
      const { data: logs } = await supabase.from('walk_logs').select('id').in('booking_id', bookingIds)
      const logIds = (logs || []).map((l: any) => l.id)
      if (logIds.length === 0) { setUnreadComments(0); return }
      const { count } = await supabase.from('walk_log_comments')
        .select('id', { count: 'exact', head: true })
        .in('walk_log_id', logIds)
        .neq('author_id', user!.id)
        .gt('created_at', lastSeen)
      setUnreadComments(count || 0)
    }

    countUnread()
    const t = setInterval(countUnread, 60000)
    return () => clearInterval(t)
  }, [user, role])

  // When the user opens the gallery page, mark everything seen
  useEffect(() => {
    if (!user || role === 'admin') return
    if (pathname?.endsWith('/gallery')) {
      localStorage.setItem(`pawtrail-gallery-last-seen-${user.id}`, new Date().toISOString())
      setUnreadComments(0)
    }
  }, [pathname, user, role])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : role[0].toUpperCase()

  // Still determining auth / redirecting — show lightweight spinner so pages
  // never flash the wrong role. This also resolves the "stuck on spinny wheel"
  // bug by gating page-render until the profile is loaded.
  if (loading || !user || !profile || profile.role !== role) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F9F8F6]">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" />
          <p className="mt-4 text-sm text-[#8A8A8A]">{loading ? 'Loading your session…' : 'Redirecting…'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9F8F6]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E5E3DB] transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        data-testid="dashboard-sidebar"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2.5 px-6 h-16 border-b border-[#E5E3DB]">
            <PawPrint className="h-7 w-7 text-[#1A4331]" />
            <span className="font-heading font-bold text-sm leading-tight text-[#1A4331]">Rocky&apos;s Retreat<br/>and Rambles</span>
            <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {items.map((item) => {
              const isActive = pathname === item.href
              const showBadge = unreadComments > 0 && (item.href === '/client/gallery' || item.href === '/walker/walks')
              const isGallery = item.href === '/client/gallery'
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-[#E8F0EC] text-[#1A4331]'
                      : 'text-[#5C5C5C] hover:bg-[#F2F0EB] hover:text-[#1A1A1A]'
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {isGallery && unreadComments > 0 && (
                    <span className="h-5 min-w-5 px-1.5 rounded-full bg-[#E06D53] text-white text-[10px] font-bold flex items-center justify-center" data-testid="gallery-unread-badge">{unreadComments > 9 ? '9+' : unreadComments}</span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="p-4 border-t border-[#E5E3DB]">
            <Link
              href={profileHref[role]}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 mb-3 px-2 py-1.5 rounded-lg hover:bg-[#F2F0EB] transition-colors group"
              data-testid="sidebar-profile-link"
            >
              <div className="relative">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name || ''} className="h-9 w-9 rounded-full object-cover border-2 border-[#E8F0EC]" />
                ) : (
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#1A4331] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-2.5 w-2.5" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
                <p className="text-xs text-[#8A8A8A] capitalize">{role}</p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              data-testid="sign-out-button"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-[#E06D53] hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-[#E5E3DB] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-[#F2F0EB]"
            data-testid="mobile-menu-button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
          <SiteFooter />
        </main>
      </div>
    </div>
  )
}
