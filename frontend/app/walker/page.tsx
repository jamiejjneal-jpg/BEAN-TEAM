'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, MapPin, Star, TrendingUp, Clock, CheckCircle2, ArrowRight } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDate, formatTime, BOOKING_STATUSES } from '@/lib/utils'
import { toast } from 'sonner'

function initialsFrom(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function WalkerDashboard() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState({ todayWalks: 0, upcomingWalks: 0, completedWalks: 0, rating: 0 })
  const [todayBookings, setTodayBookings] = useState<any[]>([])
  const [walkerProfile, setWalkerProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (user) fetchData()
  }, [user])

  async function fetchData() {
    const today = new Date().toISOString().split('T')[0]

    const [todayRes, upcomingRes, completedRes, profileRes] = await Promise.all([
      supabase.from('bookings').select('*, client:profiles!bookings_client_id_fkey(full_name), dog:dogs(name, breed)').eq('walker_id', user!.id).eq('scheduled_date', today).in('status', ['confirmed', 'in_progress']),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('walker_id', user!.id).gte('scheduled_date', today).in('status', ['pending', 'confirmed']),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('walker_id', user!.id).eq('status', 'completed'),
      supabase.from('walker_profiles').select('*').eq('id', user!.id).maybeSingle(),
    ])

    setTodayBookings(todayRes.data || [])
    setWalkerProfile(profileRes.data)
    setStats({
      todayWalks: todayRes.data?.length || 0,
      upcomingWalks: upcomingRes.count || 0,
      completedWalks: completedRes.count || 0,
      rating: profileRes.data?.rating || 0,
    })
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  // Walker onboarding (4 steps)
  const hasPhoto = !!profile?.avatar_url
  const hasBio = !!(walkerProfile?.bio && walkerProfile.bio.trim().length > 10)
  const hasRate = !!(walkerProfile?.hourly_rate && walkerProfile.hourly_rate > 0)
  const hasServiceArea = !!(walkerProfile?.service_area && walkerProfile.service_area.trim())
  const steps = [
    { key: 'photo', label: 'Profile photo', done: hasPhoto, href: '/walker/profile' },
    { key: 'bio', label: 'Short bio (≥10 chars)', done: hasBio, href: '/walker/profile' },
    { key: 'rate', label: 'Hourly rate', done: hasRate, href: '/walker/profile' },
    { key: 'area', label: 'Service area', done: hasServiceArea, href: '/walker/profile' },
  ]
  const completedCount = steps.filter(s => s.done).length
  const total = steps.length
  const percent = Math.round((completedCount / total) * 100)
  const ready = completedCount === total

  const READY_KEY = `pawtrail-walker-onboarding-complete-${user?.id}`
  if (typeof window !== 'undefined' && ready && !localStorage.getItem(READY_KEY)) {
    localStorage.setItem(READY_KEY, '1')
    toast.success('🎉 You\'re listable! Clients can now request walks with you.', {
      duration: 6000,
      action: { label: 'View profile', onClick: () => { window.location.href = '/walker/profile' } },
    })
  }

  return (
    <div className="space-y-8" data-testid="walker-dashboard">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-[#E5E3DB] shadow-sm" data-testid="walker-avatar">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile?.full_name || 'avatar'} />}
          <AvatarFallback className="text-base sm:text-lg">{initialsFrom(profile?.full_name, user?.email)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Hi {(profile?.full_name || '').trim().split(' ')[0] || 'there'} 👋</h1>
          <p className="text-[#5C5C5C] mt-1" data-testid="walker-login-email">{user?.email || profile?.email || ''}</p>
        </div>
      </div>

      {!ready && (
        <Card className="border-[#DDA74F]/30 bg-[#FDF8EF]" data-testid="walker-onboarding-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-heading font-semibold text-[#1A1A1A]">Complete your walker profile</p>
                <p className="text-xs text-[#5C5C5C] mt-0.5">{completedCount} of {total} steps complete · {percent}%</p>
              </div>
              <div className="text-2xl font-heading font-bold text-[#DDA74F]" data-testid="walker-onboarding-percent">{percent}%</div>
            </div>
            <div className="h-2 w-full rounded-full bg-[#F2E6CC] overflow-hidden mb-5">
              <div className="h-full bg-gradient-to-r from-[#DDA74F] to-[#2D7A5D] transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            <div className="space-y-2">
              {steps.map(s => (
                <Link key={s.key} href={s.href} className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors group ${s.done ? 'border-[#2D7A5D]/20 bg-[#E8F0EC]/40' : 'border-[#E5E3DB] bg-white hover:border-[#DDA74F]/50'}`} data-testid={`walker-onboarding-step-${s.key}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? 'bg-[#2D7A5D] text-white' : 'bg-[#F2F0EB] text-[#8A8A8A] border border-[#E5E3DB]'}`}>
                      {s.done ? <CheckCircle2 className="h-4 w-4" /> : ''}
                    </div>
                    <span className={`text-sm ${s.done ? 'text-[#2D7A5D] line-through opacity-70' : 'text-[#1A1A1A]'}`}>{s.label}</span>
                  </div>
                  {!s.done && <ArrowRight className="h-4 w-4 text-[#DDA74F] group-hover:translate-x-1 transition-transform" />}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Walks", value: stats.todayWalks, icon: Clock, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Upcoming', value: stats.upcomingWalks, icon: CalendarDays, color: 'bg-blue-50 text-blue-700' },
          { label: 'Completed', value: stats.completedWalks, icon: TrendingUp, color: 'bg-[#E8F0EC] text-[#1A4331]' },
          { label: 'Rating', value: Number(stats.rating).toFixed(1), icon: Star, color: 'bg-amber-50 text-amber-700' },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-[#8A8A8A]">{stat.label}</p>
                  <p className="text-2xl font-heading font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[#8EA396]" /> Today&apos;s Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {todayBookings.length === 0 ? (
            <p className="text-sm text-[#8A8A8A] text-center py-6">No walks scheduled for today</p>
          ) : (
            <div className="space-y-3">
              {todayBookings.map((b) => {
                const status = BOOKING_STATUSES[b.status as keyof typeof BOOKING_STATUSES]
                return (
                  <div key={b.id} className="flex items-center justify-between p-4 rounded-lg bg-[#F9F8F6] border border-[#E5E3DB]">
                    <div>
                      <p className="font-medium">{b.dog?.name} <span className="text-[#8A8A8A]">({b.dog?.breed})</span></p>
                      <p className="text-sm text-[#5C5C5C]">Client: {b.client?.full_name}</p>
                      <p className="text-xs font-mono text-[#8A8A8A] mt-1">{formatTime(b.scheduled_time)} | {b.duration_minutes} min | {b.walk_type}</p>
                    </div>
                    <Badge className={status?.color}>{status?.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
