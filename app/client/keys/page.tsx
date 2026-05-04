'use client'

// Client "My Keys" — shows every key we hold for them, current holder,
// and timeline. Clients don't need to scan anything.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { KeyRound, ArrowRight, Loader2 } from 'lucide-react'
import { type Key, type KeyEvent, fmtDateTime, statusTone } from '@/lib/keys'

export default function ClientKeysPage() {
  const supabase = createClient()
  const [keys, setKeys] = useState<Key[]>([])
  const [events, setEvents] = useState<Record<string, KeyEvent[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: ks } = await supabase.from('keys')
      .select(`*, current_holder:profiles!keys_current_holder_id_fkey(full_name, role)`)
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
    const keyList = (ks as Key[]) || []
    setKeys(keyList)
    if (keyList.length) {
      const ids = keyList.map(k => k.id)
      const { data: evs } = await supabase.from('key_events')
        .select('*')
        .in('key_id', ids)
        .order('created_at', { ascending: false })
      const byKey: Record<string, KeyEvent[]> = {}
      for (const e of (evs as KeyEvent[]) || []) (byKey[e.key_id] ||= []).push(e)
      setEvents(byKey)
    }
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[#8A8A8A]" />
    </div>
  )

  return (
    <div className="space-y-6" data-testid="client-keys-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-[#1A4331]" /> My Keys
        </h1>
        <p className="text-[#5C5C5C] mt-1 text-sm">
          Every key of yours we hold, with a live history of who&apos;s had it and when.
        </p>
      </div>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-[#8A8A8A]">
            No keys on file yet. If you&apos;ve handed a key over, ask us to add it and you&apos;ll get a confirmation email.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {keys.map(k => {
            const evs = events[k.id] || []
            return (
              <Card key={k.id} data-testid={`my-key-${k.qr_token}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-[#E8F0EC] text-[#1A4331] flex items-center justify-center">
                        <KeyRound className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-heading text-lg font-bold">{k.label}</p>
                        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusTone(k.status)}`}>
                          {k.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-[#8A8A8A]">Currently with</p>
                      <p className="font-medium">
                        {k.current_holder_id
                          ? <>{k.current_holder?.full_name} <span className="text-xs text-[#8A8A8A] capitalize">({k.current_holder_role})</span></>
                          : <span className="text-[#1A4331]">In our safe</span>}
                      </p>
                      <p className="text-xs text-[#8A8A8A]">Since {fmtDateTime(k.last_event_at)}</p>
                    </div>
                  </div>

                  {evs.length > 0 && (
                    <div className="pt-3 border-t border-[#F2F0EB] space-y-1.5">
                      <p className="text-xs uppercase tracking-wide text-[#8A8A8A] mb-2">Recent activity</p>
                      {evs.slice(0, 5).map(e => (
                        <div key={e.id} className="flex items-center gap-3 text-sm">
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#F2F0EB] text-[#5C5C5C] shrink-0">
                            {e.event_type}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{e.actor_name || '—'}</span>{' '}
                            <span className="text-xs text-[#8A8A8A]">· {fmtDateTime(e.created_at)}</span>
                          </span>
                        </div>
                      ))}
                      {evs.length > 5 && (
                        <Link href={`/k/${k.qr_token}`} className="text-xs text-[#1A4331] inline-flex items-center gap-1">
                          View full history <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
