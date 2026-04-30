'use client'

// Lightweight, non-intrusive NPS survey that appears on the client dashboard
// once every 30 days (or 7 days if the user dismissed it). Writes to
// public.nps_responses via RLS (INSERT own) from the omnibus migration.

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/AuthProvider'
import { X, Heart } from 'lucide-react'
import { toast } from 'sonner'

const DISMISS_KEY = (uid: string) => `rockys-nps-dismissed-${uid}`
const SHOW_AFTER_DISMISS_DAYS = 7    // snooze if they dismiss
const SHOW_AFTER_SUBMIT_DAYS = 30    // cool-down after a real submission

function daysSince(iso?: string | null) {
  if (!iso) return Infinity
  const diff = Date.now() - new Date(iso).getTime()
  return diff / (1000 * 60 * 60 * 24)
}

export function NpsPrompt() {
  const { user } = useAuth()
  const supabase = createClient()
  const [visible, setVisible] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      // Has user submitted recently?
      const { data: latest } = await supabase
        .from('nps_responses')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sinceSubmit = daysSince(latest?.created_at)
      if (sinceSubmit < SHOW_AFTER_SUBMIT_DAYS) return

      // Local dismiss snooze
      const dismissed = typeof window !== 'undefined' ? localStorage.getItem(DISMISS_KEY(user.id)) : null
      if (dismissed) {
        const d = daysSince(dismissed)
        if (d < SHOW_AFTER_DISMISS_DAYS) return
      }

      // Gate: only show if user has had at least one completed walk.
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('status', 'completed')
      if ((count ?? 0) < 1) return

      if (!cancelled) setVisible(true)
    })()
    return () => { cancelled = true }
  }, [user])

  function dismiss() {
    if (typeof window !== 'undefined' && user) {
      localStorage.setItem(DISMISS_KEY(user.id), new Date().toISOString())
    }
    setVisible(false)
  }

  async function submit() {
    if (score == null || !user) return
    setSaving(true)
    const { error } = await supabase.from('nps_responses').insert({
      user_id: user.id,
      score,
      comment: comment.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error('Could not submit — try again later'); return }
    toast.success('Thanks for your feedback ' + (score >= 9 ? '— you’re the best!' : '!'))
    setVisible(false)
  }

  if (!visible) return null

  const pickScore = (n: number) => {
    setScore(n)
    if (!expanded) setExpanded(true)
  }

  return (
    <Card
      className="border-[#1A4331]/15 bg-gradient-to-br from-[#E8F0EC] to-[#FDF8EF] overflow-hidden"
      data-testid="nps-prompt"
    >
      <CardContent className="p-5 sm:p-6 relative">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1 rounded-md text-[#8A8A8A] hover:bg-white/60 hover:text-[#1A4331] transition-colors"
          aria-label="Dismiss"
          data-testid="nps-dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0">
            <Heart className="h-5 w-5 text-[#E06D53]" />
          </div>
          <div className="pr-6">
            <p className="font-heading font-semibold text-[#1A1A1A]">How likely are you to recommend Rocky’s Retreat and Rambles to a friend?</p>
            <p className="text-xs text-[#5C5C5C] mt-0.5">0 = not a chance, 10 = absolutely, tail-wagging yes.</p>
          </div>
        </div>

        <div className="grid grid-cols-11 gap-1 sm:gap-1.5" data-testid="nps-score-row">
          {Array.from({ length: 11 }, (_, i) => i).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => pickScore(n)}
              className={[
                'aspect-square rounded-md text-xs sm:text-sm font-mono transition-all border',
                score === n
                  ? 'bg-[#1A4331] text-white border-[#1A4331] scale-105 shadow-md'
                  : n <= 6
                  ? 'bg-white text-[#E06D53] border-[#E06D53]/30 hover:border-[#E06D53] hover:-translate-y-0.5'
                  : n <= 8
                  ? 'bg-white text-[#DDA74F] border-[#DDA74F]/30 hover:border-[#DDA74F] hover:-translate-y-0.5'
                  : 'bg-white text-[#1A4331] border-[#1A4331]/30 hover:border-[#1A4331] hover:-translate-y-0.5',
              ].join(' ')}
              data-testid={`nps-score-${n}`}
            >
              {n}
            </button>
          ))}
        </div>

        {expanded && (
          <div className="mt-4 space-y-3" data-testid="nps-expanded">
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={
                score != null && score <= 6
                  ? "We'd love to do better — what let you down?"
                  : score != null && score <= 8
                  ? "What would've made it a 10?"
                  : "Lovely! What did we get right? (We may share quotes on our site — message us if you'd rather we didn't.)"
              }
              className="bg-white/80"
              data-testid="nps-comment"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={dismiss} disabled={saving}>Not now</Button>
              <Button size="sm" onClick={submit} disabled={saving || score == null} data-testid="nps-submit">
                {saving ? 'Sending…' : 'Submit'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
