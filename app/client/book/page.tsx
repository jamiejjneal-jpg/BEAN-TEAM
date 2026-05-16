'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WALK_TYPES } from '@/lib/utils'
import { toast } from 'sonner'
import { notify } from '@/lib/notify'
import { useRouter } from 'next/navigation'
import { CalendarDays, Dog, CheckCircle, AlertCircle, ArrowRight, Construction } from 'lucide-react'
import { speciesConfig, type PetSpecies } from '@/lib/species'
import Link from 'next/link'
import { walkersUnavailableOn } from '@/lib/availability'
import { useSiteServices, priceOfService } from '@/lib/useServices'

export default function BookWalk() {
  const { user } = useAuth()
  const router = useRouter()
  const { services } = useSiteServices({ clientBookableOnly: true })
  const [dogs, setDogs] = useState<any[]>([])
  const [allPets, setAllPets] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [walkers, setWalkers] = useState<any[]>([])
  const [unavailableWalkerIds, setUnavailableWalkerIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    dog_id: '', walker_id: '', scheduled_date: '', scheduled_time: '09:00',
    walk_type: 'walk_30', notes: '', pickup_address: '',
  })
  const supabase = createClient()

  useEffect(() => { if (user) fetchData() }, [user])

  // Recompute unavailable walkers whenever the date changes
  useEffect(() => {
    if (!form.scheduled_date || walkers.length === 0) {
      setUnavailableWalkerIds(new Set())
      return
    }
    let cancelled = false
    walkersUnavailableOn(walkers.map(w => w.id), form.scheduled_date).then(set => {
      if (!cancelled) setUnavailableWalkerIds(set)
    })
    return () => { cancelled = true }
  }, [form.scheduled_date, walkers])

  async function fetchData() {
    const [petsRes, walkersRes, profileRes] = await Promise.all([
      supabase.from('dogs').select('*').eq('owner_id', user!.id).eq('is_active', true),
      supabase.from('profiles').select('id, full_name, role, walker_profiles(rating, hourly_rate, total_reviews, is_available)').in('role', ['walker', 'admin']).eq('is_active', true),
      supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle(),
    ])
    const pets = petsRes.data || []
    setAllPets(pets)
    setDogs(pets.filter((p: any) => (p.species || 'dog') === 'dog'))
    setWalkers((walkersRes.data || []).filter((w: any) => w.walker_profiles?.is_available))
    setProfile(profileRes.data)
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.dog_id) { toast.error('Please select a dog'); return }
    if (!form.scheduled_date) { toast.error('Please select a date'); return }

    setSubmitting(true)
    const walkType = services.find(w => w.value === form.walk_type) || { duration_minutes: 30 }
    const { data: inserted, error } = await supabase.from('bookings').insert({
      client_id: user!.id,
      dog_id: form.dog_id,
      walker_id: form.walker_id || null,
      scheduled_date: form.scheduled_date,
      scheduled_time: form.scheduled_time,
      walk_type: form.walk_type,
      duration_minutes: walkType?.duration_minutes || 30,
      notes: form.notes,
      pickup_address: form.pickup_address,
      status: 'pending',
    }).select('id').single()

    if (error) {
      console.error('Booking insert error:', error)
      toast.error(`Failed to book walk: ${error.message}`)
      setSubmitting(false)
      return
    }

    // Notify all admins so they can review/approve the booking
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true)
    const dog = dogs.find(d => d.id === form.dog_id)
    if (admins && admins.length > 0 && inserted) {
      const rows = admins.map((a: any) => ({
        user_id: a.id,
        title: 'New Booking Request',
        message: `A new walk request${dog ? ` for ${dog.name}` : ''} on ${form.scheduled_date} at ${form.scheduled_time} needs your approval.`,
        type: 'booking',
        related_booking_id: inserted.id,
      }))
      await supabase.from('notifications').insert(rows)
    }

    // Send email alert to admins via Supabase Edge Function (fire-and-forget)
    if (inserted) {
      notify('admin_new_booking', { booking_id: inserted.id })
    }

    setSuccess(true)
    toast.success('Walk booked successfully!')
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  if (success) {
    return (
      <div className="max-w-md mx-auto py-20 text-center" data-testid="booking-success">
        <div className="h-16 w-16 rounded-full bg-[#E8F0EC] flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-8 w-8 text-[#2D7A5D]" />
        </div>
        <h2 className="font-heading text-2xl font-bold mb-2">Walk Booked!</h2>
        <p className="text-[#5C5C5C] mb-6">Your booking has been submitted. You&apos;ll be notified once a walker is assigned.</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => { setSuccess(false); setForm({ ...form, dog_id: '', scheduled_date: '', notes: '' }) }} variant="outline">Book Another</Button>
          <Button onClick={() => router.push('/client/bookings')}>View Bookings</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="book-walk-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Book a Walk</h1>
        <p className="text-[#5C5C5C] mt-1">Schedule a walk for your dog</p>
      </div>

      {/* Non-dog pets info banner */}
      {allPets.some(p => (p.species || 'dog') !== 'dog') && (
        <Card className="border-[#DDA74F]/40 bg-[#FDF8EF]" data-testid="visits-coming-soon">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shrink-0">
              <Construction className="h-4 w-4 text-[#DDA74F]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1A1A]">Home visits are coming soon</p>
              <p className="text-xs text-[#5C5C5C] mt-0.5">
                We&apos;re working on bookable home visits for {allPets.filter(p => (p.species || 'dog') !== 'dog').map(p => `${p.name} (${speciesConfig(p.species as PetSpecies).label.toLowerCase()})`).join(', ')}. For now, only dog walks can be booked.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        const profileMissing: string[] = []
        if (!profile?.full_name?.trim()) profileMissing.push('Full name')
        if (!profile?.phone?.trim()) profileMissing.push('Phone')
        if (!profile?.address?.trim()) profileMissing.push('Home address')
        if (!profile?.emergency_contact?.trim()) profileMissing.push('Emergency contact')
        if (!profile?.emergency_phone?.trim()) profileMissing.push('Emergency phone')

        const noDog = dogs.length === 0
        const incompleteDogs = dogs.filter(d =>
          !d.name || !d.breed || !d.age || !d.weight || !d.vet_name || !d.vet_phone
        )

        if (profileMissing.length === 0 && !noDog && incompleteDogs.length === 0) return null

        return (
          <Card className="border-[#E06D53]/40 bg-[#FDEDEA]" data-testid="booking-blocked-gate">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-5">
                <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-[#E06D53]" />
                </div>
                <div>
                  <h2 className="font-heading font-semibold text-[#1A1A1A]">Finish your profile first</h2>
                  <p className="text-sm text-[#5C5C5C] mt-1">We need a couple of details before you can book a walk — so your walker knows how to pick up, care for, and return your dog safely.</p>
                </div>
              </div>

              <div className="space-y-3">
                {profileMissing.length > 0 && (
                  <Link href="/client/profile" className="flex items-center justify-between gap-3 p-4 rounded-lg border border-[#E06D53]/30 bg-white hover:bg-[#FDEDEA]/40 transition-colors group" data-testid="go-to-profile-link">
                    <div>
                      <p className="font-medium text-sm text-[#1A1A1A]">Your profile</p>
                      <p className="text-xs text-[#E06D53] mt-0.5">Missing: {profileMissing.join(', ')}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#E06D53] group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}

                {noDog && (
                  <Link href="/client/pets" className="flex items-center justify-between gap-3 p-4 rounded-lg border border-[#E06D53]/30 bg-white hover:bg-[#FDEDEA]/40 transition-colors group" data-testid="go-to-pets-link">
                    <div>
                      <p className="font-medium text-sm text-[#1A1A1A]">Add your first dog</p>
                      <p className="text-xs text-[#E06D53] mt-0.5">You haven&apos;t registered a dog yet. Walks are dog-only for now.</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#E06D53] group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}

                {!noDog && incompleteDogs.length > 0 && (
                  <Link href="/client/pets" className="flex items-center justify-between gap-3 p-4 rounded-lg border border-[#E06D53]/30 bg-white hover:bg-[#FDEDEA]/40 transition-colors group" data-testid="go-to-pets-incomplete-link">
                    <div>
                      <p className="font-medium text-sm text-[#1A1A1A]">Dog profile{incompleteDogs.length !== 1 ? 's' : ''} incomplete</p>
                      <p className="text-xs text-[#E06D53] mt-0.5">{incompleteDogs.map(d => d.name || 'Unnamed').join(', ')} — missing breed, age, weight, or vet details</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#E06D53] group-hover:translate-x-1 transition-transform" />
                  </Link>
                )}
              </div>

              <p className="text-xs text-[#8A8A8A] mt-5">Once these are complete, come back here to book your walk.</p>
            </CardContent>
          </Card>
        )
      })()}

      {profile && profile.full_name && profile.phone && profile.address && profile.emergency_contact && profile.emergency_phone && dogs.length > 0 && dogs.filter(d => !d.name || !d.breed || !d.age || !d.weight || !d.vet_name || !d.vet_phone).length === 0 && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Dog className="h-5 w-5" /> Select Dog</CardTitle></CardHeader>
            <CardContent>
              <Select value={form.dog_id} onValueChange={(v) => setForm({ ...form, dog_id: v })}>
                <SelectTrigger data-testid="select-dog"><SelectValue placeholder="Choose your dog" /></SelectTrigger>
                <SelectContent>
                  {dogs.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.breed || 'Mixed'})</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} min={new Date().toISOString().split('T')[0]} required data-testid="select-date" />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={form.scheduled_time} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} required data-testid="select-time" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Walk Type</Label>
                <Select value={form.walk_type} onValueChange={(v) => setForm({ ...form, walk_type: v })}>
                  <SelectTrigger data-testid="select-walk-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {services.map(w => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label} — {w.price_label || `£${Number(w.price).toFixed(2)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Preferred Walker (Optional)</CardTitle></CardHeader>
            <CardContent>
              <Select
                value={form.walker_id}
                onValueChange={(v) => {
                  if (unavailableWalkerIds.has(v)) {
                    toast.error('That walker has approved time off on this date — pick another or change the date.')
                    return
                  }
                  setForm({ ...form, walker_id: v })
                }}
              >
                <SelectTrigger data-testid="select-walker"><SelectValue placeholder={form.scheduled_date ? 'Any available walker' : 'Pick a date first to filter availability'} /></SelectTrigger>
                <SelectContent>
                  {walkers.map((w: any) => {
                    const off = unavailableWalkerIds.has(w.id)
                    return (
                      <SelectItem
                        key={w.id}
                        value={w.id}
                        disabled={off}
                        className={off ? 'opacity-40 cursor-not-allowed' : ''}
                        data-testid={`walker-option-${w.id}${off ? '-off' : ''}`}
                      >
                        <span className="flex items-center gap-2">
                          {off && <span title="On leave for this date" aria-label="On leave">🏖️</span>}
                          <span>{w.full_name} - ${Number(w.walker_profiles?.hourly_rate || 15).toFixed(2)}/hr ({Number(w.walker_profiles?.rating || 0).toFixed(1)} stars){off ? ' — on leave' : ''}</span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {form.scheduled_date && unavailableWalkerIds.size > 0 && (
                <p className="text-xs text-[#8A8A8A] mt-2">
                  {unavailableWalkerIds.size} walker{unavailableWalkerIds.size === 1 ? '' : 's'} on leave for {form.scheduled_date} — greyed out above.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Additional Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Pickup Address</Label>
                <Input value={form.pickup_address} onChange={(e) => setForm({ ...form, pickup_address: e.target.value })} placeholder="Where to pick up your dog" data-testid="pickup-address" />
              </div>
              <div className="space-y-2">
                <Label>Notes for Walker</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any special instructions..." data-testid="booking-notes" />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" size="lg" disabled={submitting} data-testid="submit-booking">
            {submitting ? 'Booking...' : 'Confirm Booking'}
          </Button>
        </form>
      )}
    </div>
  )
}
