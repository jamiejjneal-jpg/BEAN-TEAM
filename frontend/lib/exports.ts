import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

function today() { return new Date().toISOString().slice(0, 10) }
function formatDate(d: any) { try { return d ? new Date(d).toISOString().slice(0, 10) : '' } catch { return '' } }

function download(rows: Record<string, any>[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' })
}

export async function exportClients() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, address, key_code, key_location, emergency_contact, emergency_phone, is_active, created_at')
    .eq('role', 'client')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const { data: dogCounts } = await supabase.from('dogs').select('owner_id').eq('is_active', true)
  const countMap = new Map<string, number>()
  for (const d of dogCounts || []) countMap.set((d as any).owner_id, (countMap.get((d as any).owner_id) || 0) + 1)

  const rows = (data || []).map((c: any) => ({
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
  download(rows, 'Clients', `rockys-clients-${today()}.xlsx`)
}

export async function exportPets() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dogs')
    .select('*, owner:profiles!dogs_owner_id_fkey(full_name, email, phone)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const SPECIES_LABEL: Record<string, string> = {
    dog: 'Dog', cat: 'Cat', rabbit: 'Rabbit', bird: 'Bird',
    fish: 'Fish', reptile: 'Reptile', small_mammal: 'Small Mammal',
  }

  const rows = (data || []).map((d: any) => ({
    'Pet Name': d.name || '',
    'Species': SPECIES_LABEL[d.species] || 'Dog',
    'Breed / Type': d.breed || '',
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
    'Good With Other Pets': d.good_with_dogs ? 'Yes' : 'No',
    'Good With Children': d.good_with_children ? 'Yes' : 'No',
    'Vet / Practitioner Name': d.vet_name || '',
    'Vet / Practitioner Phone': d.vet_phone || '',
    'Vet / Practitioner Address': d.vet_address || '',
    'Pet Emergency Contact': d.emergency_contact || '',
    'Pet Emergency Phone': d.emergency_phone || '',
    'Species-specific details': d.details ? JSON.stringify(d.details) : '',
    'Special Notes': d.special_notes || '',
    'Owner Name': d.owner?.full_name || '',
    'Owner Email': d.owner?.email || '',
    'Owner Phone': d.owner?.phone || '',
    'Active': d.is_active ? 'Yes' : 'No',
    'Added': formatDate(d.created_at),
  }))
  download(rows, 'Pets', `rockys-pets-${today()}.xlsx`)
}

export async function exportBookings() {
  const supabase = createClient()
  const { data: bks, error } = await supabase
    .from('bookings')
    .select('*, client:profiles!bookings_client_id_fkey(full_name, email), walker:profiles!bookings_walker_id_fkey(full_name), dog:dogs(name, breed)')
    .order('scheduled_date', { ascending: false })
  if (error) throw new Error(error.message)

  const walkerIds = Array.from(new Set((bks || []).map((b: any) => b.walker_id).filter(Boolean)))
  const { data: rates } = walkerIds.length
    ? await supabase.from('walker_profiles').select('id, hourly_rate').in('id', walkerIds)
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
  download(rows, 'Bookings', `rockys-bookings-${today()}.xlsx`)
}

/**
 * Export every walk/booking for a single user (as client OR walker).
 * Used by Admin's "Delete user" confirmation to keep a final archive for
 * GDPR / data-retention purposes before the records are anonymised.
 */
export async function exportUserWalks(userId: string, userLabel: string) {
  const supabase = createClient()
  const { data: bks, error } = await supabase
    .from('bookings')
    .select('*, client:profiles!bookings_client_id_fkey(full_name, email, phone), walker:profiles!bookings_walker_id_fkey(full_name, email), dog:dogs(name, breed), walk_logs(*)')
    .or(`client_id.eq.${userId},walker_id.eq.${userId}`)
    .order('scheduled_date', { ascending: false })
  if (error) throw new Error(error.message)

  const rows = (bks || []).map((b: any) => ({
    'Role for User':         b.client_id === userId ? 'Client' : (b.walker_id === userId ? 'Walker' : ''),
    'Date':                  b.scheduled_date || '',
    'Time':                  b.scheduled_time || '',
    'Status':                b.status || '',
    'Walk Type':             b.walk_type || '',
    'Duration (min)':        b.duration_minutes || 0,
    'Dog':                   b.dog?.name || '',
    'Breed':                 b.dog?.breed || '',
    'Client':                b.client?.full_name || '',
    'Client Email':          b.client?.email || '',
    'Client Phone':          b.client?.phone || '',
    'Walker':                b.walker?.full_name || '(unassigned)',
    'Walker Email':          b.walker?.email || '',
    'Pickup Address':        b.pickup_address || '',
    'Client Notes':          b.notes || '',
    'Admin Notes':           b.admin_notes || '',
    'Walk Log Events':       (b.walk_logs || []).length,
    'Created':               formatDate(b.created_at),
  }))

  const safe = (userLabel || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  download(
    rows.length ? rows : [{ 'Note': `No bookings found for ${userLabel}` }],
    'Walks',
    `rockys-walks-${safe || 'user'}-${today()}.xlsx`,
  )
  return rows.length
}
