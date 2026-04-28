'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Star, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'

// Inline 1-5 star picker + comment box. Renders compactly in the
// client booking detail. Self-fetches existing review (if any) so the
// UI shows "Edit your review" rather than letting clients double-up.
export function ReviewBookingForm({ booking, onSaved }: { booking: any; onSaved?: () => void }) {
  const { user } = useAuth()
  const supabase = createClient()
  const [existing, setExisting] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user || !booking?.id) return
    supabase.from('walker_reviews').select('*').eq('booking_id', booking.id).eq('client_id', user.id).maybeSingle()
      .then(({ data }) => {
        setExisting(data)
        if (data) { setRating(data.rating); setComment(data.comment || '') }
        setLoading(false)
      })
  }, [user, booking?.id])

  if (loading) return null
  if (!booking?.walker_id || booking.status !== 'completed') return null

  async function save() {
    if (rating < 1 || !user) return
    setSaving(true)
    const payload = {
      booking_id: booking.id,
      walker_id: booking.walker_id,
      client_id: user.id,
      rating,
      comment: comment.trim() || null,
      is_public: true,
    }
    const res = existing
      ? await supabase.from('walker_reviews').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('walker_reviews').insert(payload).select().single()
    setSaving(false)
    if (res.error) { toast.error('Could not save review: ' + res.error.message); return }
    setExisting(res.data); setEditing(false)
    toast.success(existing ? 'Review updated' : 'Thanks for your review!')
    onSaved?.()
  }

  if (existing && !editing) {
    return (
      <Card data-testid="existing-review-card">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(i => <Star key={i} className={`h-4 w-4 ${i <= existing.rating ? 'fill-[#DDA74F] text-[#DDA74F]' : 'text-[#E5E3DB]'}`} />)}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit-review-btn"><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
          </div>
          {existing.comment && <p className="text-sm text-[#5C5C5C] italic">&ldquo;{existing.comment}&rdquo;</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="review-form-card">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium mb-1.5">{existing ? 'Edit your review' : `Rate your walk with ${booking.walker?.full_name || 'your walker'}`}</p>
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map(i => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(0)}
                className="p-0.5"
                data-testid={`rate-${i}`}
                aria-label={`${i} star${i > 1 ? 's' : ''}`}
              >
                <Star className={`h-7 w-7 transition-colors ${i <= (hover || rating) ? 'fill-[#DDA74F] text-[#DDA74F]' : 'text-[#D1CFC6]'}`} />
              </button>
            ))}
          </div>
        </div>
        <Textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="(Optional) What went well?"
          rows={2}
          data-testid="review-comment"
        />
        <div className="flex gap-2 justify-end">
          {existing && <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setRating(existing.rating); setComment(existing.comment || '') }}>Cancel</Button>}
          <Button size="sm" onClick={save} disabled={saving || rating < 1} data-testid="submit-review">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving</> : (existing ? 'Update' : 'Submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Public review list for the walker profile + admin walker page.
export function WalkerReviewsList({ walkerId }: { walkerId: string }) {
  const supabase = createClient()
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase
      .from('walker_reviews')
      .select('*, client:profiles!walker_reviews_client_id_fkey(full_name)')
      .eq('walker_id', walkerId)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setReviews((data as any) || []); setLoading(false) })
  }, [walkerId])

  if (loading) return null
  if (reviews.length === 0) return <p className="text-sm text-[#8A8A8A]" data-testid="no-reviews">No reviews yet.</p>

  return (
    <div className="space-y-2.5" data-testid="walker-reviews-list">
      {reviews.map((r: any) => (
        <Card key={r.id}>
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(i => <Star key={i} className={`h-3.5 w-3.5 ${i <= r.rating ? 'fill-[#DDA74F] text-[#DDA74F]' : 'text-[#E5E3DB]'}`} />)}
              </div>
              <p className="text-[10px] text-[#9C8E7A]">{r.client?.full_name || 'A client'}</p>
            </div>
            {r.comment && <p className="text-sm text-[#3C3C3C] italic">&ldquo;{r.comment}&rdquo;</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
