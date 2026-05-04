'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Image from 'next/image'
import { Dog, CalendarDays, MapPin, Bell, Plus, Camera, CheckCircle2, ArrowRight } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDate, formatTime, BOOKING_STATUSES } from '@/lib/utils'
import { toast } from 'sonner'
import { NpsPrompt } from '@/components/shared/NpsPrompt'

function initialsFrom(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ClientDashboard() {
  const { user, profile } = useAuth()
  const [dogs, setDogs] = useState<any[]>([])
  const [activeBookings, setActiveBookings] = useState<any[]>([])
  const [recentNotifications, setRecentNotifications] = useState<any[]>([])
  const [recentPhotos, setRecentPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { if (user) fetchData() }, [user])

  async function fetchData() {
    const [dogsRes, bookingsRes, notifRes] = await Promise.all([
      supabase.from('dogs').select('*').eq('owner_id', user!.id).eq('is_active', true),
      supabase.from('bookings').select('*, walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name)').eq('client_id', user!.id).in('status', ['pending', 'confirmed', 'in_progress']).order('scheduled_date').limit(5),
      supabase.from('notifications').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(5),
    ])
    setDogs(dogsRes.data || [])
    setActiveBookings(bookingsRes.data || [])
    setRecentNotifications(notifRes.data || [])

    // Fetch recent walk photos
    const { data: myBookings } = await supabase.from('bookings').select('id').eq('client_id', user!.id)
    if (myBookings && myBookings.length > 0) {
      const { data: photos } = await supabase
        .from('walk_logs')
        .select('id, photo_url, created_at')
        .in('booking_id', myBookings.map(b => b.id))
        .not('photo_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6)
      setRecentPhotos(photos || [])
    }

    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  // Onboarding completeness: 4 steps
  const profileComplete = !!(profile?.full_name && profile?.phone && profile?.address)
  const emergencyComplete = !!(profile?.emergency_contact && profile?.emergency_phone)
  const hasDog = dogs.length > 0
  const dogDetailsComplete = hasDog && dogs.every(d => d.name && d.age && d.vet_name && d.vet_phone)
  const steps = [
    { key: 'profile', label: 'Personal details', done: profileComplete, href: '/client/profile' },
    { key: 'emergency', label: 'Emergency contact', done: emergencyComplete, href: '/client/profile' },
    { key: 'dog', label: 'Add your first pet', done: hasDog, href: '/client/pets' },
    { key: 'dog-details', label: 'Pet details (age, vet, etc.)', done: dogDetailsComplete, href: '/client/pets' },
  ]
  const completedCount = steps.filter(s => s.done).length
  const total = steps.length
  const percent = Math.round((completedCount / total) * 100)
  const ready = completedCount === total

  // Fire a one-off confetti toast the first time the user becomes fully ready
  const READY_KEY = `pawtrail-onboarding-complete-${user?.id}`
  if (typeof window !== 'undefined' && ready && !localStorage.getItem(READY_KEY)) {
    localStorage.setItem(READY_KEY, '1')
    toast.success('🎉 Your profile is ready! You can now book your first walk.', {
      duration: 6000,
      action: { label: 'Book now', onClick: () => { window.location.href = '/client/book' } },
    })
  }

  return (
    <div className="space-y-8" data-testid="client-dashboard">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-[#E5E3DB] shadow-sm" data-testid="client-avatar">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile?.full_name || 'avatar'} />}
            <AvatarFallback className="text-base sm:text-lg">{initialsFrom(profile?.full_name, user?.email)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">
              Hi {(profile?.full_name || '').trim().split(' ')[0] || 'there'} 👋
            </h1>
            <p className="text-[#5C5C5C] mt-1" data-testid="client-login-email">{user?.email || profile?.email || ''}</p>
          </div>
        </div>
        <Link href="/client/book">
          <Button data-testid="book-walk-cta"><Plus className="h-4 w-4 mr-1" /> Book a Walk</Button>
        </Link>
      </div>

      {ready && <NpsPrompt />}

      {!ready && (
        <Card className="border-[#DDA74F]/30 bg-[#FDF8EF]" data-testid="onboarding-progress-card">          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-heading font-semibold text-[#1A1A1A]">Get ready to book walks</p>
                <p className="text-xs text-[#5C5C5C] mt-0.5">{completedCount} of {total} steps complete · {percent}%</p>
              </div>
              <div className="text-2xl font-heading font-bold text-[#DDA74F]" data-testid="onboarding-percent">{percent}%</div>
            </div>
            <div className="h-2 w-full rounded-full bg-[#F2E6CC] overflow-hidden mb-5">
              <div className="h-full bg-gradient-to-r from-[#DDA74F] to-[#2D7A5D] transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            <div className="space-y-2">
              {steps.map(s => (
                <Link key={s.key} href={s.href} className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors group ${s.done ? 'border-[#2D7A5D]/20 bg-[#E8F0EC]/40' : 'border-[#E5E3DB] bg-white hover:border-[#DDA74F]/50'}`} data-testid={`onboarding-step-${s.key}`}>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[#E8F0EC]">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#E8F0EC] flex items-center justify-center"><Dog className="h-5 w-5 text-[#1A4331]" /></div>
            <div><p className="text-xs text-[#8A8A8A]">My Pets</p><p className="text-xl font-heading font-bold">{dogs.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><CalendarDays className="h-5 w-5 text-blue-700" /></div>
            <div><p className="text-xs text-[#8A8A8A]">Active Bookings</p><p className="text-xl font-heading font-bold">{activeBookings.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center"><Bell className="h-5 w-5 text-amber-700" /></div>
            <div><p className="text-xs text-[#8A8A8A]">Notifications</p><p className="text-xl font-heading font-bold">{recentNotifications.filter(n => !n.is_read).length}</p></div>
          </CardContent>
        </Card>
      </div>

      {dogs.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="py-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-[#E8F0EC] flex items-center justify-center mb-4">
              <Dog className="h-10 w-10 text-[#1A4331]" />
            </div>
            <h3 className="font-heading font-semibold text-lg mb-2">Add Your First Pet</h3>
            <p className="text-sm text-[#5C5C5C] mb-4">Register your pet to start booking walks and visits</p>
            <Link href="/client/pets"><Button data-testid="add-first-pet">Add a Pet</Button></Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[#8EA396]" /> Active Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {activeBookings.length === 0 ? (
            <p className="text-sm text-[#8A8A8A] text-center py-4">No active bookings</p>
          ) : (
            <div className="space-y-3">
              {activeBookings.map((b) => {
                const status = BOOKING_STATUSES[b.status as keyof typeof BOOKING_STATUSES]
                return (
                  <div key={b.id} className="flex items-center justify-between p-4 rounded-lg bg-[#F9F8F6] border border-[#E5E3DB]">
                    <div>
                      <p className="font-medium">{b.dog?.name}</p>
                      <p className="text-sm text-[#5C5C5C]">Walker: {b.walker?.full_name || 'Awaiting assignment'}</p>
                      <p className="text-xs font-mono text-[#8A8A8A] mt-1">{formatDate(b.scheduled_date)} at {formatTime(b.scheduled_time)}</p>
                    </div>
                    <Badge className={status?.color}>{status?.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {recentPhotos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-[#DDA74F]" /> Recent Walk Photos</CardTitle>
              <Link href="/client/gallery"><Button size="sm" variant="outline">View All</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {recentPhotos.map((p) => (
                <Link href="/client/gallery" key={p.id}>
                  <div className="aspect-square rounded-lg overflow-hidden border border-[#E5E3DB] hover:shadow-md hover:scale-105 transition-all">
                    <img src={p.photo_url} alt="Walk photo" className="w-full h-full object-cover" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentNotifications.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-[#DDA74F]" /> Recent Notifications</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentNotifications.map((n) => (
                <div key={n.id} className={`p-3 rounded-lg text-sm ${!n.is_read ? 'bg-[#E8F0EC]/40' : 'bg-[#F9F8F6]'}`}>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-[#5C5C5C] text-xs mt-0.5">{n.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
