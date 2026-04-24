'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShieldCheck, ChevronDown, ChevronUp, Clock } from 'lucide-react'

// Relative-time formatter — handles the "2 hours ago" phrasing without pulling
// the whole date-fns locale set.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - then)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `just now`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

type Row = { id: string; created_at: string; device: string | null; user_agent: string | null }

export function LastLoginCard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase
      .from('login_history')
      .select('id, created_at, device, user_agent')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (mounted) setRows((data as Row[]) || []) })
    return () => { mounted = false }
  }, [userId])

  if (!rows) {
    return (
      <Card className="border-[#E5E3DB]">
        <CardContent className="p-4 text-xs text-[#8A8A8A]">Loading sign-in history…</CardContent>
      </Card>
    )
  }
  if (rows.length === 0) {
    return (
      <Card className="border-[#E5E3DB]">
        <CardContent className="p-4 text-xs text-[#8A8A8A] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          First sign-in — history will appear after your next login.
        </CardContent>
      </Card>
    )
  }

  // rows[0] is the CURRENT session (we just inserted it on login). rows[1]
  // is the one the user might care about: "where was I last seen?"
  const current = rows[0]
  const previous = rows[1]
  const others   = rows.slice(2)

  return (
    <Card className="border-[#E5E3DB]" data-testid="last-login-card">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-[#1A4331]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1A1A1A]">
              {previous ? (
                <>Signed in {timeAgo(current.created_at)} — previously {timeAgo(previous.created_at)}{previous.device ? ` from ${previous.device}` : ''}.</>
              ) : (
                <>Signed in {timeAgo(current.created_at)}{current.device ? ` from ${current.device}` : ''}.</>
              )}
            </p>
            <p className="text-xs text-[#8A8A8A] mt-0.5">
              If you don&apos;t recognise a sign-in, change your password and review your account immediately.
            </p>

            {others.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 mt-2 text-[#1A4331] hover:bg-transparent hover:underline"
                  onClick={() => setOpen(o => !o)}
                  data-testid="last-login-toggle"
                >
                  {open ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                  {open ? 'Hide older' : `Show older (${others.length})`}
                </Button>
                {open && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {others.map(r => (
                      <li key={r.id} className="flex items-center gap-2 text-[#5C5C5C]" data-testid={`last-login-row-${r.id}`}>
                        <Clock className="h-3 w-3 text-[#8A8A8A]" />
                        <span className="font-mono">{new Date(r.created_at).toLocaleString()}</span>
                        {r.device && <span>— {r.device}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
