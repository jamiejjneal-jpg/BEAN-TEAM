'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatTime, BOOKING_STATUSES } from '@/lib/utils'
import { toast } from 'sonner'
import { notify } from '@/lib/notify'
import { MapPin, CheckCircle, Navigation, Home, Camera, Image as ImageIcon, Loader2, X } from 'lucide-react'

export default function WalkerWalks() {
  const { user } = useAuth()
  const [walks, setWalks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [noteText, setNoteText] = useState('')
  const [selectedWalk, setSelectedWalk] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null)
  const [walkPhotos, setWalkPhotos] = useState<Record<string, any[]>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activePhotoWalk, setActivePhotoWalk] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { if (user) fetchWalks() }, [user])

  async function fetchWalks() {
    const { data } = await supabase
      .from('bookings')
      .select('*, client:profiles!bookings_client_id_fkey(full_name, phone, email), dog:dogs(name, breed, size, special_notes, photo_url), walk_logs(*)')
      .eq('walker_id', user!.id)
      .in('status', ['confirmed', 'in_progress'])
      .order('scheduled_date', { ascending: true })
    setWalks(data || [])

    // Fetch photos for each walk
    const photoMap: Record<string, any[]> = {}
    for (const walk of (data || [])) {
      const photos = (walk.walk_logs || []).filter((l: any) => l.photo_url)
      if (photos.length > 0) photoMap[walk.id] = photos
    }
    setWalkPhotos(photoMap)
    setLoading(false)
  }

  async function logEvent(bookingId: string, eventType: string) {
    const { error } = await supabase.from('walk_logs').insert({
      booking_id: bookingId,
      walker_id: user!.id,
      event_type: eventType,
      notes: eventType === 'note' ? noteText : '',
    })
    if (error) { toast.error('Failed to log event'); return }

    if (eventType === 'arrived' || eventType === 'picked_up') {
      await supabase.from('bookings').update({
        status: 'in_progress',
        ...(eventType === 'arrived' ? { actual_start_time: new Date().toISOString() } : {}),
      }).eq('id', bookingId)
    }
    if (eventType === 'dropped_off' || eventType === 'completed') {
      await supabase.from('bookings').update({
        status: 'completed',
        actual_end_time: new Date().toISOString(),
      }).eq('id', bookingId)
    }

    toast.success(`${eventType.replace('_', ' ')} logged! Client has been notified.`)

    // Send email on pickup / dropoff events via Supabase Edge Function
    if (eventType === 'picked_up') {
      notify('client_pickup', { booking_id: bookingId })
    } else if (eventType === 'dropped_off') {
      notify('client_dropoff', { booking_id: bookingId })
    }

    setNoteText('')
    setSelectedWalk(null)
    fetchWalks()
  }

  async function handlePhotoUpload(bookingId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be under 5MB')
      return
    }

    setUploadingPhoto(bookingId)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `walks/${bookingId}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('dog-photos')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    if (uploadErr) {
      toast.error('Photo upload failed: ' + uploadErr.message)
      setUploadingPhoto(null)
      return
    }

    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(filePath)
    const photoUrl = urlData?.publicUrl

    if (photoUrl) {
      await supabase.from('walk_logs').insert({
        booking_id: bookingId,
        walker_id: user!.id,
        event_type: 'note',
        notes: 'Walk photo',
        photo_url: photoUrl,
      })
      toast.success('Photo uploaded! Client can see it in their gallery.')
    }

    setUploadingPhoto(null)
    fetchWalks()
  }

  function triggerPhotoUpload(walkId: string) {
    setActivePhotoWalk(walkId)
    fileInputRef.current?.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && activePhotoWalk) {
      handlePhotoUpload(activePhotoWalk, file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const eventActions = [
    { type: 'arrived', label: 'Arrived at Pickup', icon: Navigation, color: 'bg-blue-600 hover:bg-blue-700' },
    { type: 'picked_up', label: 'Dog Picked Up', icon: MapPin, color: 'bg-emerald-600 hover:bg-emerald-700' },
    { type: 'dropped_off', label: 'Dog Dropped Off', icon: Home, color: 'bg-amber-600 hover:bg-amber-700' },
    { type: 'completed', label: 'Walk Complete', icon: CheckCircle, color: 'bg-[#1A4331] hover:bg-[#265C45]' },
  ]

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="walker-walks-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">My Walks</h1>
        <p className="text-[#5C5C5C] mt-1">Active and upcoming walks</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelected}
      />

      {walks.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No active walks. Check back when you have confirmed bookings!</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {walks.map((walk) => {
            const status = BOOKING_STATUSES[walk.status as keyof typeof BOOKING_STATUSES]
            const logs = walk.walk_logs || []
            const loggedEvents = logs.map((l: any) => l.event_type)
            const photos = walkPhotos[walk.id] || []

            return (
              <Card key={walk.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {walk.dog?.photo_url && (
                          <img src={walk.dog.photo_url} alt={walk.dog.name} className="h-12 w-12 rounded-full object-cover border-2 border-[#E8F0EC]" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-heading font-semibold text-lg">{walk.dog?.name}</h3>
                            <Badge className={status?.color}>{status?.label}</Badge>
                          </div>
                          <p className="text-sm text-[#5C5C5C]">{walk.dog?.breed || 'N/A'} | {walk.dog?.size || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm text-[#5C5C5C]">
                        <p>Client: {walk.client?.full_name}</p>
                        <p>Phone: {walk.client?.phone || 'N/A'}</p>
                        <p className="font-mono text-xs">{formatDate(walk.scheduled_date)} at {formatTime(walk.scheduled_time)}</p>
                        <p>{walk.duration_minutes} min | {walk.walk_type}</p>
                      </div>
                      {walk.pickup_address && <p className="text-sm mt-2">Pickup: {walk.pickup_address}</p>}
                      {walk.dog?.special_notes && <p className="text-sm text-[#E06D53] mt-1">Notes: {walk.dog.special_notes}</p>}

                      {logs.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-[#8A8A8A] uppercase tracking-wider">Walk Log</p>
                          {logs.filter((l: any) => !l.photo_url).map((log: any) => (
                            <div key={log.id} className="flex items-center gap-2 text-xs text-[#5C5C5C]">
                              <CheckCircle className="h-3 w-3 text-[#2D7A5D]" />
                              <span className="capitalize">{log.event_type.replace('_', ' ')}</span>
                              <span className="font-mono text-[#8A8A8A]">{new Date(log.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Walk Photos Gallery */}
                      {photos.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-[#8A8A8A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <ImageIcon className="h-3 w-3" /> Walk Photos ({photos.length})
                          </p>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {photos.map((p: any) => (
                              <div key={p.id} className="relative shrink-0 h-20 w-20 rounded-lg overflow-hidden border border-[#E5E3DB] group">
                                <img src={p.photo_url} alt="Walk photo" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[180px]">
                      {eventActions.map((action) => (
                        <Button
                          key={action.type}
                          size="sm"
                          disabled={loggedEvents.includes(action.type)}
                          className={`text-white ${loggedEvents.includes(action.type) ? 'opacity-40' : action.color}`}
                          onClick={() => logEvent(walk.id, action.type)}
                          data-testid={`walk-action-${action.type}-${walk.id}`}
                        >
                          <action.icon className="h-4 w-4 mr-1" />
                          {action.label}
                        </Button>
                      ))}

                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#DDA74F] text-[#DDA74F] hover:bg-[#DDA74F]/10"
                        onClick={() => triggerPhotoUpload(walk.id)}
                        disabled={uploadingPhoto === walk.id}
                        data-testid={`upload-photo-${walk.id}`}
                      >
                        {uploadingPhoto === walk.id ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading...</>
                        ) : (
                          <><Camera className="h-4 w-4 mr-1" /> Upload Photo</>
                        )}
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => setSelectedWalk(selectedWalk === walk.id ? null : walk.id)} data-testid={`add-note-${walk.id}`}>
                        Add Note
                      </Button>

                      {selectedWalk === walk.id && (
                        <div className="space-y-2 mt-1">
                          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Walk note..." className="text-sm" />
                          <Button size="sm" onClick={() => logEvent(walk.id, 'note')} disabled={!noteText}>Save Note</Button>
                        </div>
                      )}
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
