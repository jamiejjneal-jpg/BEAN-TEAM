'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import { Image as ImageIcon, ChevronLeft, ChevronRight, X, Dog, Camera, Download, Calendar, User, MessageSquare, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ClientGallery() {
  const { user, profile } = useAuth()
  const [photos, setPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [filter, setFilter] = useState<string>('all')
  const [dogs, setDogs] = useState<any[]>([])
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const supabase = createClient()

  useEffect(() => { if (user) fetchData() }, [user])

  async function fetchData() {
    // Get all bookings for this client
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, dog_id, scheduled_date, walker_id, dog:dogs(name, breed, photo_url), walker:profiles!bookings_walker_id_fkey(full_name)')
      .eq('client_id', user!.id)

    if (!bookings || bookings.length === 0) { setLoading(false); return }

    // Get all walk photos from walk_logs
    const bookingIds = bookings.map(b => b.id)
    const { data: logs } = await supabase
      .from('walk_logs')
      .select('*')
      .in('booking_id', bookingIds)
      .not('photo_url', 'is', null)
      .order('created_at', { ascending: false })

    // Enrich photos with booking data
    const enrichedPhotos = (logs || []).map(log => {
      const booking = bookings.find(b => b.id === log.booking_id)
      return {
        ...log,
        dog_name: booking?.dog?.name || 'Unknown',
        dog_breed: booking?.dog?.breed || '',
        dog_photo: booking?.dog?.photo_url,
        dog_id: booking?.dog_id,
        walker_name: booking?.walker?.full_name || 'Unknown',
        walk_date: booking?.scheduled_date,
      }
    })

    setPhotos(enrichedPhotos)

    // Get unique dogs for filter
    const { data: dogsData } = await supabase.from('dogs').select('id, name').eq('owner_id', user!.id).eq('is_active', true)
    setDogs(dogsData || [])

    setLoading(false)
  }

  function openLightbox(index: number) {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  function nextPhoto() {
    setLightboxIndex((prev) => (prev + 1) % filteredPhotos.length)
  }

  function prevPhoto() {
    setLightboxIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length)
  }

  // Handle keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowRight') nextPhoto()
      if (e.key === 'ArrowLeft') prevPhoto()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxOpen, photos.length])

  const filteredPhotos = filter === 'all' ? photos : photos.filter(p => p.dog_id === filter)
  const currentPhoto = filteredPhotos[lightboxIndex]

  // Load comments whenever the lightbox opens or moves to a new photo
  useEffect(() => {
    if (!lightboxOpen || !currentPhoto) return
    supabase
      .from('walk_log_comments')
      .select('*, author:profiles(full_name, avatar_url, role)')
      .eq('walk_log_id', currentPhoto.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setComments(data || []))
    setNewComment('')
  }, [lightboxOpen, currentPhoto?.id])

  async function postComment() {
    if (!newComment.trim() || !currentPhoto) return
    setPosting(true)
    const { error } = await supabase.from('walk_log_comments').insert({
      walk_log_id: currentPhoto.id,
      author_id: user!.id,
      body: newComment.trim(),
    })
    setPosting(false)
    if (error) { toast.error('Failed to post'); return }
    setNewComment('')
    const { data } = await supabase.from('walk_log_comments').select('*, author:profiles(full_name, avatar_url, role)').eq('walk_log_id', currentPhoto.id).order('created_at', { ascending: true })
    setComments(data || [])
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="client-gallery-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Camera className="h-7 w-7 text-[#DDA74F]" />
            Walk Gallery
          </h1>
          <p className="text-[#5C5C5C] mt-1">Photos from your dog&apos;s walks</p>
        </div>
        <p className="text-sm text-[#8A8A8A]">{filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Dog filter */}
      {dogs.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === 'all' ? 'bg-[#1A4331] text-white' : 'bg-[#F2F0EB] text-[#5C5C5C] hover:bg-[#E5E3DB]'
            }`}
            data-testid="filter-all"
          >
            All Dogs
          </button>
          {dogs.map(dog => (
            <button
              key={dog.id}
              onClick={() => setFilter(dog.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                filter === dog.id ? 'bg-[#1A4331] text-white' : 'bg-[#F2F0EB] text-[#5C5C5C] hover:bg-[#E5E3DB]'
              }`}
              data-testid={`filter-dog-${dog.id}`}
            >
              {dog.name}
            </button>
          ))}
        </div>
      )}

      {filteredPhotos.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-[#F2F0EB] flex items-center justify-center mb-4">
              <ImageIcon className="h-10 w-10 text-[#8EA396]" />
            </div>
            <h3 className="font-heading font-semibold text-lg mb-2">No walk photos yet</h3>
            <p className="text-sm text-[#8A8A8A] max-w-md mx-auto">
              When your walker takes photos during walks, they&apos;ll appear here in your gallery. Book a walk to get started!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(index)}
              className="group relative aspect-square rounded-xl overflow-hidden border border-[#E5E3DB] cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              data-testid={`gallery-photo-${photo.id}`}
            >
              <img
                src={photo.photo_url}
                alt={`${photo.dog_name} walk photo`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <p className="text-white text-sm font-medium truncate">{photo.dog_name}</p>
                <p className="text-white/70 text-xs">{formatDate(photo.walk_date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox / Slideshow */}
      {lightboxOpen && currentPhoto && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={() => setLightboxOpen(false)}>
          {/* Close button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            data-testid="lightbox-close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 z-10 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 text-white text-sm font-mono">
            {lightboxIndex + 1} / {filteredPhotos.length}
          </div>

          {/* Navigation arrows */}
          {filteredPhotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto() }}
                className="absolute left-4 z-10 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                data-testid="lightbox-prev"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto() }}
                className="absolute right-4 z-10 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                data-testid="lightbox-next"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Main image */}
          <div className="max-w-4xl max-h-[90vh] overflow-y-auto mx-auto px-16 py-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentPhoto.photo_url}
              alt={`${currentPhoto.dog_name} walk photo`}
              className="max-w-full max-h-[60vh] object-contain rounded-lg mx-auto"
            />
            {/* Photo info */}
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-xl px-6 py-3">
                <div className="flex items-center gap-1.5 text-white text-sm">
                  <Dog className="h-4 w-4 text-[#DDA74F]" />
                  <span className="font-medium">{currentPhoto.dog_name}</span>
                  {currentPhoto.dog_breed && <span className="text-white/60">({currentPhoto.dog_breed})</span>}
                </div>
                <div className="h-4 w-px bg-white/20" />
                <div className="flex items-center gap-1.5 text-white/80 text-sm">
                  <User className="h-3.5 w-3.5" />
                  <span>{currentPhoto.walker_name}</span>
                </div>
                <div className="h-4 w-px bg-white/20" />
                <div className="flex items-center gap-1.5 text-white/80 text-sm">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDate(currentPhoto.walk_date)}</span>
                </div>
              </div>
              {currentPhoto.notes && currentPhoto.notes !== 'Walk photo' && (
                <p className="text-white/60 text-sm mt-2 italic">&quot;{currentPhoto.notes}&quot;</p>
              )}
              {currentPhoto.caption && (
                <p className="text-white/90 text-sm mt-2 italic">&quot;{currentPhoto.caption}&quot;</p>
              )}
            </div>

            {/* Comments panel */}
            <div className="mt-4 max-w-2xl mx-auto bg-white rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-2.5 border-b border-[#E5E3DB] flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#1A4331]" />
                <h3 className="font-heading font-semibold text-sm">Comments ({comments.length})</h3>
              </div>
              <div className="max-h-52 overflow-y-auto px-4 py-3 space-y-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-[#8A8A8A] text-center py-2">No comments yet. Be the first!</p>
                ) : comments.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    {c.author?.avatar_url ? (
                      <img src={c.author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0 mt-0.5" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                        {(c.author?.full_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-medium text-[#1A1A1A]">{c.author?.full_name || 'Unknown'} <span className="text-[#8A8A8A] font-normal text-[10px] capitalize">· {c.author?.role}</span></p>
                      <p className="text-sm text-[#3C3C3C] mt-0.5 break-words">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-[#E5E3DB] flex gap-2">
                <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); postComment() } }} placeholder="Write a comment..." data-testid="client-gallery-comment-input" />
                <Button size="sm" onClick={postComment} disabled={posting || !newComment.trim()} data-testid="client-gallery-comment-submit">
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Thumbnail strip */}
          {filteredPhotos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 bg-white/10 backdrop-blur-sm rounded-xl p-2 max-w-[80vw] overflow-x-auto">
              {filteredPhotos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i) }}
                  className={`shrink-0 h-12 w-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === lightboxIndex ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
