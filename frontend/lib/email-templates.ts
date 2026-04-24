// Email templates shown in the Admin Email Center.
// Each template has a subject, a short descriptor, and an HTML body (the
// greeting is auto-prepended by the bulk-mail edge function per recipient).

export type EmailTemplate = {
  key: string
  label: string
  category: 'onboarding' | 'lifecycle' | 'operational' | 'blank'
  subject: string
  // HTML body (no <html>/<body> wrapper — the edge function wraps it).
  html: string
  // If present, this template can be auto-sent on a matching trigger.
  autoKey?: 'welcome_client' | 'welcome_walker' | 'leaving_client' | 'leaving_walker' | 'booking_reminder'
  autoDescription?: string
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: 'welcome_client',
    label: 'Welcome — New client',
    category: 'onboarding',
    subject: "Welcome to Rocky's Retreat and Rambles 🐾",
    autoKey: 'welcome_client',
    autoDescription: 'Automatically sent the moment a new client is created (by self-signup or by an admin).',
    html: `<p>Welcome to the Rocky's family! We're delighted to have you and your four-legged friend join us.</p>
<p>Here's what happens next:</p>
<ul>
  <li>Log in to your dashboard and finish your dog's profile — vet details, feeding schedule, any allergies.</li>
  <li>Pop in a keycode or access notes so your walker can collect them smoothly.</li>
  <li>Book your first walk whenever you're ready.</li>
</ul>
<p>Any questions at all, just reply to this email — a real human will get back to you.</p>
<p>Warmly,<br/>The Rocky's Retreat and Rambles team</p>`,
  },
  {
    key: 'welcome_walker',
    label: 'Welcome — New walker',
    category: 'onboarding',
    subject: "Welcome to the pack — a few bits to get you started",
    autoKey: 'welcome_walker',
    autoDescription: 'Automatically sent when an admin adds a new walker.',
    html: `<p>Delighted to have you on the team!</p>
<p>A couple of quick things to set up in your walker dashboard:</p>
<ul>
  <li>Upload a friendly profile photo and a short bio — clients love to see who'll be walking their dog.</li>
  <li>Set your weekly availability so we can book you in.</li>
  <li>Add your payment details when prompted.</li>
</ul>
<p>Shout if anything's unclear. Welcome aboard!</p>
<p>— Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'leaving_client',
    label: 'Farewell — Client leaving',
    category: 'lifecycle',
    subject: "Thank you — we'll miss you and your pup",
    autoKey: 'leaving_client',
    autoDescription: 'Automatically sent when an admin deletes a client from Team / Clients.',
    html: `<p>We just wanted to say a huge thank you for trusting us with your dog's walks over the time you've been with us.</p>
<p>If you ever need us again, your account stays ready — just log in and book. Otherwise, we wish you and your pup all the very best.</p>
<p>Please reply to this email if you have any feedback — it genuinely helps us get better.</p>
<p>With gratitude,<br/>Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'leaving_walker',
    label: 'Farewell — Walker leaving',
    category: 'lifecycle',
    subject: 'Thank you for being part of the Rocky\'s team',
    autoKey: 'leaving_walker',
    autoDescription: 'Automatically sent when an admin deletes a walker from Team / Walkers.',
    html: `<p>Thank you for the time, care and miles you put in walking the Rocky's dogs. We're genuinely grateful.</p>
<p>Your account and walk history will remain accessible for a short while. If there's anything we can help with — a reference, a final payout query, anything at all — please reply to this email.</p>
<p>All the very best in what's next.</p>
<p>— Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'bereavement',
    label: 'Condolences — Dog bereavement',
    category: 'lifecycle',
    subject: "Thinking of you and your family",
    html: `<p>We were so sorry to hear about the loss of your beloved dog. Please accept our sincere condolences from everyone at Rocky's.</p>
<p>They were a joy to walk and we feel privileged to have been part of their days. Take all the time you need — your account is paused and you don't need to do a thing.</p>
<p>If there's ever anything we can do, simply reply to this email. We're thinking of you.</p>
<p>With love,<br/>Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'please_contact',
    label: 'Please contact us',
    category: 'operational',
    subject: "A quick favour — please get in touch",
    html: `<p>When you have a moment, could you please get in touch? Nothing to worry about — there's just something we'd like to go over with you.</p>
<p>You can reply directly to this email or give us a call whenever suits.</p>
<p>Thank you!<br/>Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'booking_reminder',
    label: 'Booking reminder',
    category: 'operational',
    subject: "Just a friendly reminder about your upcoming walk",
    autoKey: 'booking_reminder',
    autoDescription: 'Automatically sent 24 hours before a confirmed walk (requires the booking-reminder Edge Function + Supabase Cron — see deploy guide).',
    html: `<p>This is a quick reminder about your upcoming walk with us.</p>
<p>Please make sure your dog has their lead, collar and any bits we usually take (towel, favourite toy) ready by the door. If anything changes, simply reply to this email or update the booking in your dashboard.</p>
<p>See you soon!<br/>Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'weather_cancel',
    label: 'Weather cancellation',
    category: 'operational',
    subject: "Walk cancelled today — severe weather",
    html: `<p>Unfortunately the weather today is too extreme for a safe walk, so we've had to cancel your booking.</p>
<p>Your account has been updated and no payment will be taken. If you'd like to rebook for another day, just log in and pick a new slot.</p>
<p>Stay warm and dry!<br/>Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'holiday_closure',
    label: 'Holiday closure notice',
    category: 'operational',
    subject: "Holiday closure dates — please plan ahead",
    html: `<p>Just a quick heads-up that we'll be closed for the following dates:</p>
<p><strong>[Replace with dates]</strong></p>
<p>Please book any walks you need around these dates as early as possible — availability will be limited either side. Thank you for understanding!</p>
<p>— Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'price_change',
    label: 'Price change notice',
    category: 'operational',
    subject: "A small update to our walk prices",
    html: `<p>We wanted to give you advance notice of a small update to our walk prices, effective <strong>[replace with date]</strong>.</p>
<p>The new pricing list is available on our website pricing page. Any bookings already confirmed stay at the current price — the change only applies to new bookings from that date.</p>
<p>Thank you for your continued trust in us.</p>
<p>— Rocky's Retreat and Rambles</p>`,
  },
  {
    key: 'blank',
    label: 'Blank — write your own',
    category: 'blank',
    subject: '',
    html: `<p>Type your message here.</p>`,
  },
]
