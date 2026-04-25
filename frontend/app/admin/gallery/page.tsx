'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { Image as ImageIcon, Trash2, Dog, User, Calendar, Plus, Send, MessageSquare, Upload, Loader2, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { sendNotification } from '@/lib/notify'

export default function AdminGallery() {
  const { user, profile } = useAuth()
  const [photos, setPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [lightbox, setLightbox] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [uploadDialog, setUploadDialog] = useState(false)
  const [bookings, setBookings] = useState<any[]>([])
  const [dogs, setDogs] = useState<any[]>([])
  const [selectedBooking, setSelectedBooking] = useState<string>('')
  const [selectedDog, setSelectedDog] = useState<string>('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionDraft, setCaptionDraft] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { fetchPhotos() }, [])
  useEffect(() => { if (lightbox) fetchComments(lightbox.id) }, [lightbox])

  async function fetchPhotos() {
    const { data } = await supabase
      .from('walk_logs')
      .select('*, booking:bookings(scheduled_date, dog:dogs(name), client:profiles!bookings_client_id_fkey(full_name), walker:profiles!bookings_walker_id_fkey(full_name))')
      .not('photo_url', 'is', null)
      .order('created_at', { ascending: false })
    setPhotos(data || [])
    setLoading(false)
  }

  async function fetchComments(walkLogId: string) {
    const { data } = await supabase
      .from('walk_log_comments')
      .select('*, author:profiles(full_name, avatar_url, role)')
      .eq('walk_log_id', walkLogId)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  async function postComment() {
    if (!newComment.trim() || !lightbox) return
    setPostingComment(true)
    const { error } = await supabase.from('walk_log_comments').insert({
      walk_log_id: lightbox.id,
      author_id: user!.id,
      body: newComment.trim(),
    })
    setPostingComment(false)
    if (error) { toast.error('Failed to post: ' + error.message); return }
    setNewComment('')
    fetchComments(lightbox.id)
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from('walk_log_comments').delete().eq('id', id)
    if (error) { toast.error('Failed to delete'); return }
    if (lightbox) fetchComments(lightbox.id)
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    try {
      const url = new URL(deleteConfirm.photo_url)
      const pathMatch = url.pathname.match(/\/dog-photos\/(.+)/)
      if (pathMatch) await supabase.storage.from('dog-photos').remove([pathMatch[1].split('?')[0]])
    } catch { /* ignore */ }
    await supabase.from('walk_logs').delete().eq('id', deleteConfirm.id)
    toast.success('Photo deleted')
    setDeleteConfirm(null)
    if (lightbox?.id === deleteConfirm.id) setLightbox(null)
    fetchPhotos()
  }

  async function openUploadDialog() {
    const [bRes, dRes] = await Promise.all([
      supabase.from('bookings')
        .select('id, scheduled_date, dog_id, dog:dogs(id, name), walker_id, walker:profiles!bookings_walker_id_fkey(full_name)')
        .in('status', ['completed', 'in_progress', 'confirmed'])
        .order('scheduled_date', { ascending: false }).limit(50),
      supabase.from('dogs').select('id, name, breed, owner_id').eq('is_active', true).order('name'),
    ])
    setBookings(bRes.data || [])
    setDogs(dRes.data || [])
    setSelectedBooking('')
    setSelectedDog('')
    setUploadFile(null); setUploadPreview(null); setUploadCaption('')
    setUploadDialog(true)
  }

  // When a booking is picked, auto-tag the dog. User can still change it.
  function onBookingChange(id: string) {
    setSelectedBooking(id)
    if (id === '__none') { setSelectedBooking(''); return }
    const b = bookings.find(x => x.id === id)
    const dogId = (b as any)?.dog?.id || (b as any)?.dog_id
    if (dogId) setSelectedDog(dogId)
  }

  function handleUploadSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return }
    setUploadFile(f)
    const r = new FileReader()
    r.onload = () => setUploadPreview(r.result as string)
    r.readAsDataURL(f)
  }

  async function handleUpload() {
    if (!uploadFile) { toast.error('Choose a photo to upload'); return }
    if (!selectedBooking && !selectedDog) { toast.error('Pick a booking OR tag a pet'); return }
    setUploading(true)
    const ext = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const folder = selectedBooking ? `walks/${selectedBooking}` : `dogs/${selectedDog || 'adhoc'}`
    const path = `${folder}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('dog-photos').upload(path, uploadFile, { cacheControl: '3600', upsert: true })
    if (upErr) { setUploading(false); toast.error('Upload failed: ' + upErr.message); return }
    const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(path)
    const photo_url = `${urlData.publicUrl}?t=${Date.now()}`

    const booking = selectedBooking ? bookings.find(b => b.id === selectedBooking) : null
    const finalDogId = selectedDog || (booking as any)?.dog?.id || null
    const { error: insErr } = await supabase.from('walk_logs').insert({
      booking_id: selectedBooking || null,
      walker_id:  (booking as any)?.walker_id || user?.id || null,
      dog_id:     finalDogId,
      photo_url,
      caption: uploadCaption || '',
      event_type: 'photo',
    })
    setUploading(false)
    if (insErr) { toast.error('Save failed: ' + insErr.message); return }
    toast.success('Photo added to gallery')

    // Fire a preference-aware notification to the dog's owner.
    try {
      if (finalDogId) {
        const dog = dogs.find((d: any) => d.id === finalDogId)
        const ownerId = dog?.owner_id
        if (ownerId) {
          const { data: owner } = await supabase
            .from('profiles').select('email, full_name')
            .eq('id', ownerId).maybeSingle()
          const dogName = dog?.name || 'your pet'
          await sendNotification({
            kind: 'photo_added',
            toUserId: ownerId,
            toEmail: owner?.email || null,
            toName: owner?.full_name || null,
            title: `📸 New photo of ${dogName}`,
            message: uploadCaption ? uploadCaption : `We added a fresh photo of ${dogName} to your gallery.`,
            emailSubject: `New photo of ${dogName}`,
            emailHtml: `<p>We just popped a new photo of <strong>${dogName}</strong> into your Rocky&apos;s gallery. ${uploadCaption ? `<br/><em>&ldquo;${uploadCaption}&rdquo;</em>` : ''}</p>
              <p><a href="${typeof window !== 'undefined' ? window.location.origin : ''}/client/gallery" style="display:inline-block;background:#1A4331;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View the gallery</a></p>
              <p style="color:#8A8A8A;font-size:12px">Don&apos;t want photo emails? Turn them off in your Settings &rarr; Notifications.</p>`,
          })
        }
      }
    } catch (e) { console.warn('[gallery] notify failed', e) }

    setUploadDialog(false)
    fetchPhotos()
  }

  async function saveCaption() {
    if (!lightbox) return
    const { error } = await supabase.from('walk_logs').update({ caption: captionDraft }).eq('id', lightbox.id)
    if (error) { toast.error('Failed to save'); return }
    setLightbox({ ...lightbox, caption: captionDraft })
    setEditingCaption(false)
    fetchPhotos()
    toast.success('Caption updated')
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E3DB] border-t-[#1A4331]" /></div>

  return (
    <div className="space-y-6" data-testid="admin-gallery-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon className="h-7 w-7 text-[#DDA74F]" /> Manage Gallery
          </h1>
          <p className="text-[#5C5C5C] mt-1">{photos.length} walk photo{photos.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openUploadDialog} data-testid="admin-add-photo-button"><Plus className="h-4 w-4 mr-1.5" /> Add Photo</Button>
      </div>

      {photos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-[#8A8A8A]">No walk photos yet</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {photos.map(p => (
            <div key={p.id} className="group relative aspect-square rounded-xl overflow-hidden border border-[#E5E3DB]">
              <img src={p.photo_url} alt="Walk photo" className="w-full h-full object-cover cursor-pointer" onClick={() => { setLightbox(p); setCaptionDraft(p.caption || '') }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-white text-xs truncate">{p.booking?.dog?.name} | {p.booking?.walker?.full_name || 'Admin'}</p>
                  <p className="text-white/60 text-[10px]">{formatDate(p.created_at)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p) }} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600" data-testid={`delete-photo-${p.id}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox with comments */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white text-3xl leading-none z-10 hover:text-[#DDA74F]">&times;</button>
          <div className="max-w-6xl w-full grid lg:grid-cols-[1.5fr_1fr] gap-4 max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-3">
              <img src={lightbox.photo_url} alt="" className="max-w-full max-h-[70vh] object-contain rounded-lg bg-black/40 mx-auto" />
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 text-white text-xs flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5"><Dog className="h-3.5 w-3.5" /> {lightbox.booking?.dog?.name}</span>
                <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {lightbox.booking?.walker?.full_name || 'Admin'}</span>
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatDate(lightbox.created_at)}</span>
                <button onClick={() => setDeleteConfirm(lightbox)} className="ml-auto text-red-300 hover:text-red-200 inline-flex items-center gap-1"><Trash2 className="h-3 w-3" /> Delete</button>
              </div>
              {/* Caption */}
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 text-white text-sm">
                {editingCaption ? (
                  <div className="space-y-2">
                    <Textarea value={captionDraft} onChange={(e) => setCaptionDraft(e.target.value)} className="bg-white text-[#1A1A1A] text-sm" placeholder="Add a caption..." rows={2} />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => { setCaptionDraft(lightbox.caption || ''); setEditingCaption(false) }} className="text-[#1A1A1A]">Cancel</Button>
                      <Button size="sm" onClick={saveCaption}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="flex-1 italic text-white/90">{lightbox.caption || <span className="text-white/40">No caption</span>}</p>
                    <button onClick={() => setEditingCaption(true)} className="text-white/60 hover:text-[#DDA74F]"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            </div>

            {/* Comments panel */}
            <div className="bg-white rounded-xl flex flex-col max-h-[70vh]">
              <div className="px-4 py-3 border-b border-[#E5E3DB] flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#1A4331]" />
                <h3 className="font-heading font-semibold text-sm">Comments ({comments.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-[#8A8A8A] text-center py-6">No comments yet. Be the first!</p>
                ) : comments.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    {c.author?.avatar_url ? (
                      <img src={c.author.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 mt-0.5" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {(c.author?.full_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1A1A1A]">{c.author?.full_name || 'Unknown'} <span className="text-[#8A8A8A] font-normal capitalize text-[10px]">· {c.author?.role}</span></p>
                      <p className="text-sm text-[#3C3C3C] mt-0.5 break-words">{c.body}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-[#8A8A8A]">
                        <span>{new Date(c.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        {(c.author_id === user?.id || profile?.role === 'admin') && (
                          <button onClick={() => deleteComment(c.id)} className="text-[#E06D53] hover:underline">Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-[#E5E3DB]">
                <div className="flex gap-2">
                  <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }} placeholder="Write a comment..." disabled={postingComment} data-testid="admin-gallery-comment-input" />
                  <Button size="sm" onClick={postComment} disabled={postingComment || !newComment.trim()} data-testid="admin-gallery-comment-submit">
                    {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add photo dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add photo to gallery</DialogTitle>
            <DialogDescription>Upload a walk photo and link it to a booking so the client can see it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Linked booking <span className="text-[#8A8A8A] text-xs font-normal">(optional — for walk photos)</span></Label>
              <Select value={selectedBooking || '__none'} onValueChange={onBookingChange}>
                <SelectTrigger data-testid="select-upload-booking"><SelectValue placeholder="Stand-alone photo (no booking)" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="__none">No booking — stand-alone photo</SelectItem>
                  {bookings.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.scheduled_date} — {b.dog?.name} with {b.walker?.full_name || '(unassigned)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#8A8A8A]">Link to a walk if this photo is from one — otherwise leave empty and tag the pet below.</p>
            </div>

            <div className="space-y-2">
              <Label>Tag a pet <span className="text-[#E06D53]">*</span> <span className="text-[#8A8A8A] text-xs font-normal">(so it shows on the client&apos;s pet page)</span></Label>
              <Select value={selectedDog} onValueChange={setSelectedDog}>
                <SelectTrigger data-testid="select-upload-pet"><SelectValue placeholder="Pick a pet" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {dogs.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.breed ? `(${d.breed})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Photo</Label>
              {uploadPreview ? (
                <div className="relative h-48 w-full rounded-lg overflow-hidden border border-[#E5E3DB]">
                  <img src={uploadPreview} alt="preview" className="w-full h-full object-cover" />
                  <button onClick={() => { setUploadFile(null); setUploadPreview(null) }} className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} type="button" className="w-full h-32 rounded-lg border-2 border-dashed border-[#E5E3DB] flex flex-col items-center justify-center text-[#8A8A8A] hover:border-[#1A4331] hover:text-[#1A4331]">
                  <Upload className="h-6 w-6 mb-1.5" />
                  <span className="text-sm">Click to choose a photo</span>
                  <span className="text-xs text-[#8A8A8A] mt-0.5">JPG / PNG / WebP · Max 5MB</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUploadSelect} />
            </div>

            <div className="space-y-2">
              <Label>Caption <span className="text-[#8A8A8A] text-xs font-normal">(optional — shown under the photo)</span></Label>
              <Textarea value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="e.g. Rocky's first paddle at Hyde Park 💦" data-testid="upload-caption" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadFile || !selectedDog} data-testid="admin-upload-submit">
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-2" /> Add to Gallery</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this photo?</DialogTitle></DialogHeader>
          <p className="text-sm text-[#5C5C5C]">This will permanently remove the photo from the gallery and storage.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
