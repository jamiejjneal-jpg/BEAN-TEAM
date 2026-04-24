import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { error: null }
}

function buildXlsxResponse(rows: Record<string, any>[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function formatDate(d: any) {
  if (!d) return ''
  try { return new Date(d).toISOString().slice(0, 10) } catch { return '' }
}

export async function GET(request: Request) {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const url = new URL(request.url)
  const type = url.searchParams.get('type') // 'clients' | 'dogs'
  if (type !== 'clients' && type !== 'dogs' && type !== 'bookings') {
    return NextResponse.json({ error: 'type must be clients, dogs, or bookings' }, { status: 400 })
  }

  const admin = createAdminClient()
  const today = formatDate(new Date())

  if (type === 'clients') {
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, address, key_code, key_location, emergency_contact, emergency_phone, is_active, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Count dogs per client
    const { data: dogCounts } = await admin.from('dogs').select('owner_id').eq('is_active', true)
    const countMap = new Map<string, number>()
    for (const d of dogCounts || []) countMap.set(d.owner_id, (countMap.get(d.owner_id) || 0) + 1)

    const rows = (data || []).map(c => ({
      'Full Name': c.full_name || '',
      'Email': c.email || '',
      'Phone': c.phone || '',
      'Home Address': c.address || '',
      'Keycode': c.key_code || '',
      'Key Location / Access Notes': c.key_location || '',
      'Emergency Contact': c.emergency_contact || '',
      'Emergency Phone': c.emergency_phone || '',
      'Dogs Registered': countMap.get(c.id) || 0,
      'Active': c.is_active ? 'Yes' : 'No',
      'Member Since': formatDate(c.created_at),
    }))

    return buildXlsxResponse(rows, 'Clients', `pawtrail-clients-${today}.xlsx`)
  }

  // type === 'dogs'
  if (type === 'dogs') {
    const { data, error } = await admin
      .from('dogs')
      .select('*, owner:profiles!dogs_owner_id_fkey(full_name, email, phone)')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data || []).map((d: any) => ({
    'Dog Name': d.name || '',
    'Breed': d.breed || '',
    'Age (yrs)': d.age ?? '',
    'Weight (kg)': d.weight ?? '',
    'Size': d.size || '',
    'Off Lead': d.off_lead ? 'Yes' : 'No',
    'Neutered': d.neutered ? 'Yes' : 'No',
    'Microchipped': d.microchipped ? 'Yes' : 'No',
    'Microchip Number': d.microchip_number || '',
    'Vaccinations Up to Date': d.vaccinations_up_to_date ? 'Yes' : 'No',
    'Vaccination Details': d.vaccination_details || '',
    'Medical Info': d.medical_info || '',
    'Allergies': d.allergies || '',
    'Food Type': d.food_type || '',
    'Food Schedule': d.food_schedule || '',
    'Temperament': d.temperament || '',
    'Good With Dogs': d.good_with_dogs ? 'Yes' : 'No',
    'Good With Children': d.good_with_children ? 'Yes' : 'No',
    'Vet Name': d.vet_name || '',
    'Vet Phone': d.vet_phone || '',
    'Vet Address': d.vet_address || '',
    'Dog Emergency Contact': d.emergency_contact || '',
    'Dog Emergency Phone': d.emergency_phone || '',
    'Special Notes': d.special_notes || '',
    'Owner Name': d.owner?.full_name || '',
    'Owner Email': d.owner?.email || '',
    'Owner Phone': d.owner?.phone || '',
    'Active': d.is_active ? 'Yes' : 'No',
    'Added': formatDate(d.created_at),
  }))

  return buildXlsxResponse(rows, 'Dogs', `pawtrail-dogs-${today}.xlsx`)
  }

  // type === 'bookings'
  const { data: bks, error: bErr } = await admin
    .from('bookings')
    .select('*, client:profiles!bookings_client_id_fkey(full_name, email), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name, breed)')
    .order('scheduled_date', { ascending: false })
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  // Pull walker rates for revenue calc
  const walkerIds = Array.from(new Set((bks || []).map((b: any) => b.walker_id).filter(Boolean)))
  const { data: rates } = walkerIds.length
    ? await admin.from('walker_profiles').select('id, hourly_rate').in('id', walkerIds)
    : { data: [] as any[] }
  const rateMap = new Map<string, number>((rates || []).map((r: any) => [r.id, Number(r.hourly_rate) || 0]))

  const rows = (bks || []).map((b: any) => {
    const rate = rateMap.get(b.walker_id) || 0
    const revenue = b.status === 'completed' ? ((b.duration_minutes || 0) / 60) * rate : 0
    return {
      'Date': b.scheduled_date || '',
      'Time': b.scheduled_time || '',
      'Status': b.status || '',
      'Walk Type': b.walk_type || '',
      'Duration (min)': b.duration_minutes || 0,
      'Dog': b.dog?.name || '',
      'Breed': b.dog?.breed || '',
      'Client': b.client?.full_name || '',
      'Client Email': b.client?.email || '',
      'Walker': b.walker?.full_name || '(unassigned)',
      'Walker Rate (£/hr)': rate.toFixed(2),
      'Revenue (£)': revenue.toFixed(2),
      'Pickup Address': b.pickup_address || '',
      'Client Notes': b.notes || '',
      'Admin Notes': b.admin_notes || '',
      'Created': formatDate(b.created_at),
    }
  })

  return buildXlsxResponse(rows, 'Bookings', `pawtrail-bookings-${today}.xlsx`)
}
