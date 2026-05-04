import QRCode from 'qrcode'

export type Key = {
  id: string
  client_id: string
  label: string
  qr_token: string
  status: 'active' | 'lost' | 'retired'
  current_holder_id: string | null
  current_holder_role: string | null
  last_event_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  client?: { full_name: string | null; email: string | null; phone?: string | null } | null
  current_holder?: { full_name: string | null; role?: string | null } | null
}

export type KeyEvent = {
  id: string
  key_id: string
  event_type: 'created' | 'viewed' | 'pickup' | 'dropoff' | 'lost' | 'retired' | 'reactivated' | 'relabelled'
  actor_id: string | null
  actor_role: string | null
  actor_name: string | null
  note: string | null
  geo_lat: number | null
  geo_lng: number | null
  user_agent: string | null
  created_at: string
}

export function newKeyToken(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // unambiguous (no I, O, 0, 1)
  const arr = new Uint8Array(length)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length]
  return out
}

export function keyUrl(token: string, origin?: string): string {
  const o = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${o}/k/${token}`
}

export async function qrDataUrl(url: string, size = 512): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: size,
    color: { dark: '#1A4331', light: '#FFFFFF' },
  })
}

export function statusTone(s: Key['status']): string {
  if (s === 'lost')    return 'bg-[#FDEDEA] text-[#E06D53] border-[#E06D53]/30'
  if (s === 'retired') return 'bg-[#F2F0EB] text-[#8A8A8A] border-[#E5E3DB]'
  return 'bg-[#E8F0EC] text-[#1A4331] border-[#1A4331]/30'
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
