import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(time: string) {
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${ampm}`
}

export function getDayName(day: number) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[day]
}

// Walk types
// `clientBookable: true` = clients can book this themselves (self-service).
// `clientBookable: false` = admin-only booking (used by the UI to hide these
// options on the client booking flow).
export const WALK_TYPES = [
  // Clients may self-book walks and training.
  { value: 'walk_30',      label: '30-minute walk — £12',            duration: 30,   clientBookable: true,  petRequired: true  },
  { value: 'walk_60',      label: '1-hour walk — £15',               duration: 60,   clientBookable: true,  petRequired: true  },
  { value: 'walk_60_two',  label: '1-hour walk (2 dogs) — £25',      duration: 60,   clientBookable: true,  petRequired: true  },
  { value: 'one_to_one',   label: '1-2-1 session (45 min) — £25',    duration: 45,   clientBookable: true,  petRequired: true  },
  { value: 'training',     label: 'Training session (1 hr) — £35',   duration: 60,   clientBookable: true,  petRequired: true  },
  { value: 'puppy_visit',  label: 'Puppy visit (30 min) — £12',      duration: 30,   clientBookable: true,  petRequired: true  },
  // Admin-only bookings (more complex / chargeable services).
  { value: 'key_dropoff',  label: 'Key drop-off / collection',        duration: 15,   clientBookable: false, petRequired: false },
  { value: 'key_handover', label: 'Key handover meeting',             duration: 30,   clientBookable: false, petRequired: false },
  { value: 'daycare_4',    label: 'Day Care up to 4 hrs — £20',       duration: 240,  clientBookable: false, petRequired: true  },
  { value: 'daycare_day',  label: 'Day Care 9am–4pm — £30',           duration: 420,  clientBookable: false, petRequired: true  },
  { value: 'daycare_ext',  label: 'Day Care 10+ hrs — £35',           duration: 600,  clientBookable: false, petRequired: true  },
  { value: 'overnight',    label: 'Overnight Stay (24h) — £50',       duration: 1440, clientBookable: false, petRequired: true  },
  { value: 'house_sit',    label: 'House Sitting (24h) — £80',        duration: 1440, clientBookable: false, petRequired: false },
  { value: 'pop_in',       label: 'Pop-in visit (30 min) — £15',      duration: 30,   clientBookable: false, petRequired: false },
  { value: 'vet_visit',    label: 'Vet appointment (taxi + wait)',    duration: 120,  clientBookable: false, petRequired: true  },
  { value: 'groomer_run',  label: 'Groomer drop-off & pickup',        duration: 90,   clientBookable: false, petRequired: true  },
  { value: 'meet_greet',   label: 'Meet & greet (new client)',        duration: 45,   clientBookable: false, petRequired: false },
  { value: 'admin_note',   label: 'Admin note / reminder (no walk)',  duration: 0,    clientBookable: false, petRequired: false },
]

export const DOG_SIZES = [
  { value: 'small', label: 'Small (under 10kg)' },
  { value: 'medium', label: 'Medium (10-25kg)' },
  { value: 'large', label: 'Large (25-45kg)' },
  { value: 'extra_large', label: 'Extra Large (45kg+)' },
]

export const BOOKING_STATUSES = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In Progress', color: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
}
