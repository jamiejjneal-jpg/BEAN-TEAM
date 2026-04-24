'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDate, formatTime, BOOKING_STATUSES } from '@/lib/utils'
import { toast } from 'sonner'
import { Star, X } from 'lucide-react'

export default function ClientBookings() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewDialog, setReviewDialog] = useState<any>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const supabase = createClient()

  useEffect(() => { if (user) fetchBookings() }, [user])

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name, breed), reviews(*)')
      .eq('client_id', user!.id)
      .order('scheduled_date', { ascending: false })
    setBookings(data || [])
    setLoading(false)
  }

  async function cancelBooking(id: string) {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    toast.success('Booking cancelled')
    fetchBookings()
  }

  async function submitReview() {
    if (!reviewDialog) return
    const { error } = await supabase.from('reviews').insert({
      booking_id: reviewDialog.id,
      client_id: user!.id,
      walker_id: reviewDialog.walker_id,
      rating: reviewRating,
      comment: reviewComment,
    })
    if (error) { toast.error('Failed to submit review'); return }
    toast.success('Review submitted!')
    setReviewDialog(null)
    setReviewRating(5)
    setReviewComment('')
    fetchBookings()
  }

  const active = bookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status))
  const past = bookings.filter(b => ['completed', 'cancelled'].includes(b.status))

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  function BookingCard({ booking }: { booking: any }) {
    const status = BOOKING_STATUSES[booking.status as keyof typeof BOOKING_STATUSES]
    const hasReview = booking.reviews && booking.reviews.length > 0

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-heading font-semibold">{booking.dog?.name}</h3>
              <p className="text-sm text-[#5C5C5C]">{booking.dog?.breed}</p>
            </div>
            <Badge className={status?.color}>{status?.label}</Badge>
          </div>
          <div className="space-y-1 text-sm text-[#5C5C5C]">
            <p>Walker: {booking.walker?.full_name || 'Awaiting assignment'}</p>
            <p className="font-mono text-xs">{formatDate(booking.scheduled_date)} at {formatTime(booking.scheduled_time)}</p>
            <p className="capitalize">{booking.walk_type} | {booking.duration_minutes} min</p>
            {booking.pickup_address && <p>Pickup: {booking.pickup_address}</p>}
          </div>
          <div className="flex gap-2 mt-4">
            {booking.status === 'pending' && (
              <Button size="sm" variant="destructive" onClick={() => cancelBooking(booking.id)} data-testid={`cancel-booking-${booking.id}`}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            )}
            {booking.status === 'completed' && !hasReview && booking.walker_id && (
              <Button size="sm" onClick={() => { setReviewDialog(booking); setReviewRating(5); setReviewComment('') }} data-testid={`review-booking-${booking.id}`}>
                <Star className="h-3.5 w-3.5 mr-1" /> Leave Review
              </Button>
            )}
            {hasReview && (
              <div className="flex items-center gap-1 text-sm text-[#DDA74F]">
                {Array.from({ length: booking.reviews[0].rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6" data-testid="client-bookings-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Bookings</h1>
        <p className="text-[#5C5C5C] mt-1">{bookings.length} total booking{bookings.length !== 1 ? 's' : ''}</p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-past">Past ({past.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {active.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-[#8A8A8A]">No active bookings</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">{active.map(b => <BookingCard key={b.id} booking={b} />)}</div>
          )}
        </TabsContent>
        <TabsContent value="past">
          {past.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-[#8A8A8A]">No past bookings</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">{past.map(b => <BookingCard key={b.id} booking={b} />)}</div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate Your Walk</DialogTitle>
            <DialogDescription>How was your experience with {reviewDialog?.walker?.full_name}?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setReviewRating(star)} className="p-1" data-testid={`star-${star}`}>
                  <Star className={`h-8 w-8 transition-colors ${star <= reviewRating ? 'text-[#DDA74F] fill-[#DDA74F]' : 'text-[#E5E3DB]'}`} />
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Comment (optional)</Label>
              <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Tell us about your experience..." data-testid="review-comment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
            <Button onClick={submitReview} data-testid="submit-review">Submit Review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
