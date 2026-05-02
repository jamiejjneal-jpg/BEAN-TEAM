# PawTrail - Dog Walking Business Management System

## Problem Statement
Build a dog walking business management system with three roles (Admin, Walker, Client) using Next.js + Supabase. Features: authentication, role-based dashboards, dog profiles with rich health/vet/behaviour info, walk booking with admin approval workflow, walker scheduling, walk photo gallery with slideshow, pickup/dropoff notifications, and a public pricing page. Payment integration deferred.

## Architecture
- **Frontend**: Next.js 16 (App Router) + Tailwind CSS v4 + shadcn/ui
- **Backend**: Supabase (Auth + PostgreSQL + Realtime + Storage)
- **Admin API**: Next.js route handler `/api/admin/create-admin` using Supabase service role
- **CSS Fallback**: Static `/public/styles.css` loaded in `layout.tsx` (production deployment strips devDependencies, so we ship pre-compiled CSS)

## User Personas
1. **Admin** — Manages the platform: walkers, clients, dogs, bookings (approve/reject with reasons), and can create other admins.
2. **Walker** — Manages schedule, views assigned walks, marks pickup/dropoff, uploads photos, maintains profile with bio/rate/photo.
3. **Client** — Registers dogs (with full health / vet / behaviour profile), books walks, tracks status, views photo gallery, manages personal profile including keycode and emergency contacts.

## What's Been Implemented

### Feb 2026 — Tweaks batch (13 items)
**P0 bugs fixed:**
- Client-side role guard in `DashboardLayout` — walker/client navigating to `/admin/*` is redirected; middleware doesn't run on static CDN so this was a security hole.
- Login race fixed: hard `window.location.href` after `signInWithPassword` + profile-table role lookup when `user_metadata.role` is empty → no more "takes a refresh to log in".
- "Pages stuck on spinny wheel" gated by the same guard — pages never mount until `user + profile` are ready.
- Admin **Add Dog** button + dialog added on `/admin/dogs` (owner select + name required; other fields editable later).
- Admin **Add Booking** button + dialog added on `/admin/bookings` (client → dog → walker cascade, auto-confirms when a walker is assigned).
- Booking error surfaced — shows actual Supabase error in the toast.
- **SQL migration** `/app/supabase_fix_booking_checks.sql` drops the restrictive `walk_type` CHECK constraint that was causing "Failed to book walk".

**P1 UX polish:**
- Admin Dashboard: name greeting (`Hi <first name> 👋`) + login email line; replaced "Recent Bookings" with Today/This-week **toggle** + inline **Cancel** button on each row (writes to audit log).
- **Search** bar added to Walkers + Clients pages (name / email / phone / address).
- Audit Log: **Export Excel (.xlsx)** + **Export PDF** (native print-to-PDF, paginated, A4 landscape). Exports honor the active filter/search.

**P2 features (new):**
- New page `/admin/calendar` — **Printable Weekly Walks Calendar** (Mon → Sun grid, prev/next/this-week navigation, A4-landscape print layout with per-day tables and client phone numbers).
- New page `/admin/email` — **Admin Email Center** with 11 templates (welcome client/walker, farewell client/walker, dog bereavement, please contact us, booking reminder, weather cancellation, holiday closure, price change, blank). Audience groups: all clients / all walkers / all users / pick specific. Live preview, subject + HTML body editor. Bulk-send via new **`bulk-mail` Edge Function** (admin-only, writes `email_sent` row to audit log with counts).
- Sidebar items added: "Weekly Calendar" and "Email Center".


### Feb 15 2026 — Phase 2 future-proofing (Reviews, iCal, PWA, Analytics, Tests)

**Walker reviews & ratings**
- New SQL: `/app/supabase/migrations/20260421_walker_reviews.sql` — table + RLS + auto-recompute trigger that updates `walker_profiles.rating` & `total_reviews` on every insert/update/delete.
- `/app/frontend/components/shared/Reviews.tsx` — `ReviewBookingForm` (1-5 stars + comment) and `WalkerReviewsList` (public list).

**iCal export**
- `/app/frontend/lib/ical.ts` — RFC 5545 generator with `downloadICS()` helper.
- Added "Add to my calendar" button on `/client/bookings` (header — bulk export of upcoming) and per-card "Add to calendar" for individual events.

**PWA**
- `/app/frontend/public/manifest.json` (Rocky's logo, theme #1A4331, standalone display).
- Layout exports `manifest`, `themeColor`, `appleWebApp` so iOS users can "Add to Home Screen".

**Analytics dashboard**
- New `/admin/analytics` page with: total revenue (all-time + last 30d), bookings count, repeat-booking rate, top walker, revenue by service (horizontal bars), 6-month trend (vertical bars), peak booking days (DOW chart). All native CSS — no chart libraries.
- Sidebar: "Analytics" link added between Weekly Calendar and Email Center.

**Walker mobile-first tweaks**
- Walker walks page action buttons (Pickup, Drop-off, Photo, Note) now `h-12` on mobile, full-width — touch-target friendly for outdoor one-handed use.

**Playwright smoke tests**
- `/app/frontend/tests/smoke.spec.ts` + `playwright.config.ts` — covers public pages, sitemap/robots, login, admin nav (Bookings → Pets → Analytics), Add Booking dialog open. Run with `yarn playwright test`.


### Feb 15 2026 — Future-proofing pass
- New legal/SEO routes: `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`.
- Layout: added Open Graph + Twitter Card metadata, Schema.org `LocalBusiness` JSON-LD, and `<link rel=preconnect>` to Supabase for ~150-300ms faster first DB call.
- Backups: `/app/supabase/functions/db-backup/index.ts` weekly Edge Function emails JSON snapshot of all 9 core tables to admin via Resend.
- Retention: `/app/supabase/migrations/20260420_retention.sql` — pg_cron purges audit_log after 12 months, login_history after 90 days.
- Security runbook: `/app/memory/SECURITY.md` with key-rotation procedures, hardening checklist, and incident response template.
- Footer now links to /privacy and /terms.


### Feb 15 2026 — Multi-Pet Migration (Dogs → Pets)
- Business expanded from dogs-only to multi-pet: **Dog, Cat, Rabbit, Bird, Fish, Reptile, Small Mammal**.
- Naming: user-facing copy now says "Pet"; DB table is still `dogs` (low-risk migration — adds columns, keeps FKs/RLS intact).
- New SQL migration `/app/supabase/migrations/20260215_multi_pet.sql`:
  - `CREATE TYPE pet_species AS ENUM (...)` — 7 species.
  - `CREATE TYPE service_type AS ENUM ('walk','visit')`.
  - `ALTER TABLE dogs ADD COLUMN species pet_species DEFAULT 'dog'` + `details JSONB`.
  - `ALTER TABLE bookings ADD COLUMN service_type service_type DEFAULT 'walk'` + `visit_type text`.
  - Relaxed `walk_logs_event_type_check` to allow `feeding / medication / tank_check / cage_clean / litter_change / playtime`.
- New frontend:
  - `/app/frontend/lib/species.ts` — central species config with icons, walkable flag, and per-species JSONB form fields.
  - `/app/frontend/app/client/pets/page.tsx` — replaces `/client/dogs`. Species picker + species-specific details tab (tank size, water type, cage size, enclosure, etc.).
  - `/app/frontend/app/admin/pets/page.tsx` — replaces `/admin/dogs`. Species filter dropdown + same detailed form.
  - `/app/frontend/components/shared/PetPhotoStrip.tsx` — replaces `DogPhotoStrip`.
- Booking flow: walks are dog-only; non-dog pets show a "Home visits coming soon" info banner. Visit-booking logic is scaffolded in DB but UI is Phase 2.
- Sidebar nav updated: "My Dogs" → "My Pets", "Dogs" → "Pets".

### Feb 2026 — Fix: Admin "Delete User" FK constraint (SQLSTATE 23503)
- New SQL migration `/app/supabase_fk_ondelete_migration.sql`:
  - `bookings.client_id`, `bookings.walker_id`, `bookings.dog_id` → `ON DELETE SET NULL` (history preserved).
  - `walk_logs.walker_id`, `reviews.client_id`, `reviews.walker_id` → `ON DELETE SET NULL`.
  - `walker_payouts.paid_by` → `SET NULL`; `walker_payouts.walker_id` stays `CASCADE`.
  - `gallery_comments.author_id` → `SET NULL` (when table exists).
  - `site_images.updated_by`, `audit_log.actor_id` re-asserted `SET NULL`.
  - Drops `NOT NULL` from the columns that now accept NULL.
  - Idempotent (drop-if-exists / add).
- `admin-ops` edge function hardened with a defensive pre-delete cleanup pass
  (nulls bookings/walks/reviews refs, removes walker_profile/payouts/notifications/dogs)
  so delete works even before the SQL migration is run.
- Admin bookings table now shows "Deleted client" / "Deleted dog" fallbacks for
  orphaned rows (instead of empty cells).

### Feb 2026 — Renamed /admin/admins → /admin/team (ad-blocker workaround)
- Clicking "Admins" in the sidebar was being silently blocked on some browsers by ad-blocker extensions (uBlock/AdBlock etc.) because the URL path `/admin/admins` contains "admins" which trips several ad-filter rules.
- Renamed the route to `/admin/team` and sidebar label to "Team". No code logic changed — just path + label.

### Feb 2026 — Audit log + relaxed admin-side validation
- **New table `audit_log`** (migration at `/app/supabase_audit_log_migration.sql`): append-only, admin read + insert only. Fields: action, target_type, target_id, target_name, actor info, details jsonb, created_at.
- **Browser helper** `/app/frontend/lib/audit.ts` (`logAudit`) — admins write entries directly via RLS.
- **`admin-ops` edge function** now writes audit rows for `admin_created`, `role_changed`, `user_deleted`.
- **Audit logging hooks** added to: walker add/update, client add/update, dog update/deactivate, booking approve/reject, payout mark-paid/reversed, site-image update/reset.
- **New page `/admin/audit`** (sidebar entry "Audit Log") — search + action-filter UI, 15 known action types with icons, human-readable descriptions, relative timestamps ("2 hours ago"). Shows last 300 events.
- **Admin-side validation relaxed** — when admins add walkers / clients / dogs, only the absolute minimum is required:
  - Walker: email + password (6+ chars). Full name and everything else optional.
  - Client: email + password (6+ chars). Home address, emergency contact, property access etc. all optional.
  - Dog: name only. Breed, age, weight, vet details all optional.
- **Client self-signup on `/register` remains strict** — still requires full name, email, valid password. Clients adding their own dogs still need full details. Admins can save partial records and clients can complete them later.

### Feb 2026 — Client-side Excel exports + Role management
- **Excel exports moved client-side**: new `/app/frontend/lib/exports.ts` (xlsx via `XLSX.writeFile`) handles Clients / Dogs / Bookings exports directly in the browser. No server dependency — works on static-hosted deploy.
- **Third Edge Function `admin-ops`** (`/app/supabase/functions/admin-ops/index.ts`) performs privileged admin tasks via service role:
  - `create_admin` — replaces legacy `/srv/admin/create-admin`, sends welcome + password-reset email via Resend.
  - `change_role` — move any user between admin/walker/client. Safety rails: can't demote self; can't remove the last active admin; auto-creates `walker_profiles` row when promoting to walker.
  - `delete_user` — deletes both auth user and profile. Safety: can't delete self; can't delete last admin.
- **UI now on Admins, Walkers, Clients pages**:
  - Role-change dropdown (`<Select>`) with confirmation dialog.
  - Hard-delete button with descriptive confirmation dialog (previously soft-delete only).
  - All actions use the new `/app/frontend/lib/admin-ops.ts` helper.
- Deploy guide updated at `/app/SUPABASE_EDGE_FUNCTIONS_DEPLOY.md` — now deploys three functions: `notify`, `weekly-digest`, `admin-ops`.

### Feb 2026 — Email Notifications via Supabase Edge Functions
- Two Deno edge functions created under `/app/supabase/functions/`:
  - **`notify`** — handles admin_new_booking, client_booking_approved/rejected, client_pickup, client_dropoff (uses Resend REST API, role-based auth via caller's JWT).
  - **`weekly-digest`** — computes last-7-days KPIs, emails admins + per-client walk summaries. Dual-auth: accepts `Bearer <CRON_SECRET>` (for scheduled runs) or admin user JWT (for on-demand button).
- Frontend updated to invoke via `supabase.functions.invoke('notify'|'weekly-digest')` — no more `/srv/notify` or `/srv/admin/send-weekly-digest` dependency.
- New helper `/app/frontend/lib/notify.ts` wraps the invoke call fire-and-forget.
- Deployment guide at `/app/SUPABASE_EDGE_FUNCTIONS_DEPLOY.md` covers CLI install, linking, secret setup (`RESEND_API_KEY`, `SENDER_EMAIL`, `APP_URL`, `CRON_SECRET`), deploy, and Supabase Cron scheduling.
- Works fully on the static-hosted deploy — no Node.js server required.

### Feb 2026 — Static-Deploy Compatibility Fix
- **Root cause identified**: `ink-validator.emergent.host` is served by Cloudflare as a pure static site. All `/srv/*` API routes return the static HTML fallback instead of JSON, silently breaking any page that fetches them.
- Converted `/admin/site-images`, `/admin/health` and `/admin/walkers/payouts` pages to call Supabase **directly from the browser** (admin RLS already permits the required reads/writes). No `/srv/*` dependency remaining on these pages.
- Health page now reports DB tables, columns, storage buckets, and counts — purely from the client session.
- Pages still work identically in preview; on the deployed static site they now load fully.
- **Known limitations on static deploy** (to be addressed separately): admin creation (`/srv/admin/create-admin`), Excel exports (`/srv/admin/export`), email notifications (`/srv/notify`, `/srv/admin/send-weekly-digest`), weekly digest cron — all require a Node.js server and are broken on the deployed host.

### Feb 2026 — Admin-Managed Site Images
- New admin page `/admin/site-images` (added to sidebar) to replace public-page photos: landing hero, pricing portrait, login background, register background.
- Supabase Storage bucket `site-images` (public) + table `site_images` (key → url, admin-only write via RLS).
- API handler `/srv/admin/site-images/route.ts`: GET list (public), POST multipart upload (admin, 8 MB max, JPEG/PNG/WebP/GIF), DELETE reset-to-default (admin).
- Reusable client component `<SiteImage>` — shows slot's default instantly, then swaps to admin override once fetched.
- Public pages (`/`, `/pricing`, `/login`, `/register`) updated to use `<SiteImage>` with graceful fallbacks.
- SQL migration: `/app/supabase_site_images_migration.sql` (idempotent).

### Feb 2026 — Deployment Build Fix
- Converted dynamic route `/admin/walkers/[id]/payouts` → query-param `/admin/walkers/payouts?id=<id>` to fix Next.js `output: export` static export build failure.
- Moved matching API handler `/srv/admin/walkers/[id]/payouts/route.ts` → `/srv/admin/walkers/payouts/route.ts` (reads `id` from query, `export const dynamic = 'force-dynamic'`).
- Fixed page fetches that still called `/api/admin/…` to use `/srv/admin/…` (proxy-safe).
- `yarn build` now passes cleanly; all 34 pages build with only `/srv/*` routes marked dynamic as expected.

### Feb 2026 (This Session — P0 Profile & Workflow Enhancements)
- Register page: admin signup removed — only Client/Walker public registration.
- **Client profile page** `/client/profile`: avatar upload, phone, home address, keycode + access instructions, emergency contact (name/phone/relation).
- **Walker profile page** `/walker/profile`: profile photo upload + bio, rate, experience, max dogs, service area.
- **Dog profile**: tabbed form (Basic / Health & Food / Vet & Emergency / Behaviour) with off-lead toggle, vaccinations, food, allergies, microchip, emergency contact, temperament, good-with-dogs/children, photo upload.
- **Admin booking approval workflow** `/admin/bookings`:
  - Pending-bookings review banner.
  - Approve button (assigns walker + notifies client).
  - Decline button (requires reason in Admin Notes, notifies client with reason).
  - Existing status-update flow retained for non-pending bookings.
- **Client → Admin notifications on new booking** — every active admin receives an in-app notification when a client creates a booking.
- **Admin creates admin** `/admin/admins`: list existing admins + form to create new admin (uses service role via `/api/admin/create-admin`).
- **Pricing link prominent** — added to landing page header + dedicated pricing CTA section + client sidebar nav.
- SQL migration file `/app/supabase_profile_admin_migration.sql` (idempotent) for new columns.

### April 2026 (Prior Session)
- Walk Photo Gallery with lightbox/slideshow, walker upload during active walks.
- Tailwind CSS deployment fix (static fallback stylesheet).
- Landing, login/register (with role picker), all role dashboards.

## Prioritized Backlog

### P0 (Next)
- **Email notifications**
  - Admin email on new booking request (requires Resend/SendGrid).
  - Client email on pickup/dropoff events (walker triggers).
  - Client email on booking approval/rejection.

### P1
- Stripe payment integration (deferred).
- Password reset flow.
- Customisable color/background theme.
- Walk photo captions (walker-written).

### P2
- SMS notifications (Twilio).
- GPS tracking during walks.
- Recurring bookings.
- Walker earnings dashboard.
- Advanced analytics for admins.

## SQL Files
- `/app/supabase_migration.sql` — base schema.
- `/app/supabase_fix_policies.sql` — RLS policies.
- `/app/supabase_fix_grants.sql` — role grants.
- `/app/supabase_profile_admin_migration.sql` — **NEW** profile/dog extensions + notifications INSERT policy.

## Critical Deployment Notes
- `/app/frontend/public/styles.css` is the production CSS fallback. After any new Tailwind classes are introduced, rebuild (`yarn build`) and copy `.next/static/chunks/*.css` → `public/styles.css`.
- Admin creation route requires `SUPABASE_SERVICE_ROLE_KEY` (already in `/app/frontend/.env`).

### Feb 2026 (Fork — Omnibus Notifications Fix)
- Resolved broken Next.js build by adding role-specific notification routes:
  `/admin/notifications`, `/walker/notifications`, `/client/notifications` — all wired to shared `components/shared/NotificationsPageInner.tsx`.
- Fixed schema inconsistency: shared notifications page now uses `is_read` (matching `NotificationBell` + `lib/notify.ts`).
- `yarn build` green — all 50 routes compile; supervisor now boots frontend cleanly.
- Expanded `supabase/migrations/20260426_omnibus.sql` to also create `notifications` + `notification_prefs` tables (with RLS + indexes) so it is fully self-contained for user paste.
- Edge Functions `user-erase` (GDPR Art. 17) and `storage-cleanup` (monthly bucket orphan sweep) delivered for user to paste into Supabase Dashboard.



### Feb 2026 (Fork — Omnibus UI Hooks)
- **NPS prompt** (`components/shared/NpsPrompt.tsx`) on client dashboard: appears once every 30 days after at least one completed walk; 0–10 score + optional comment; writes to `nps_responses`; dismiss snooze = 7 days.
- **Walker time-off** (`/walker/unavailability`): new self-service page; walker adds/removes holiday/sick blocks via `walker_unavailability`; added to walker sidebar nav as "Time Off".
- **Polished cancellation dialog** on `/client/bookings`: replaced `window.prompt` with reason picker (6 canned reasons + free-text); writes `cancellation_reason`, `cancelled_by`, `cancelled_at`. Reason is also shown on past-booking cards.
- **Admin cancel/reject** now also writes the same three columns (`rejectBooking` + any `updateBooking` that sets status→cancelled).
- **DBS / Insurance / First-Aid badges** already wired on `/client/walkers` cards — confirmed rendering off the new omnibus `walker_profiles` columns.
- All 51 routes build cleanly.


### Feb 2026 (Fork — Time-off approval workflow)
- **Walker time-off requests now require admin approval** — new status/approval columns + RLS rules on `walker_unavailability`. Migration: `20260430_time_off_approval.sql`.
- **Recurring patterns** — walker & admin can mark time off as: one-off, weekly (repeats on the start-date’s weekday), or block (every N weeks). `end_date` is now nullable for ongoing.
- **Admin page `/admin/time-off`** — pending-approval queue with review dialog (approve/reject + note), plus "Add time off" button that writes an auto-approved record directly for any walker. Filter by walker; full history tabs (Pending / Approved / Rejected).
- **Walker page `/walker/unavailability`** upgraded — status badges, recurring pattern picker, ongoing toggle, rejection reason shown back, withdraw button for pending only.
- **Notifications** — walkers get in-app + email via `bulk-mail` when admin approves/rejects/creates time off. Admins get in-app when a walker submits a new request (`lib/notifyTimeOff.ts`).
- New admin sidebar link "Time Off".


### Feb 2026 (Fork — Regular walks + site footer + availability guard)
- **Recurring walks UI** — new `/client/recurring` page (clients create "Mon/Wed/Fri 12:30 for Max" templates; app auto-generates first 8 weeks of bookings + "Extend 4w" button) and `/admin/recurring` overview (pause/resume/extend/delete any client template). Both sidebars updated.
- **`bookings.recurring_template_id` link column** — migration `20260430_recurring_link.sql` so pausing/deleting a template cleans up its upcoming bookings.
- **Availability soft-check on `/client/book`** — when client picks a date, walkers with approved time off for that day are disabled in the dropdown with a 🏖️ indicator and "— on leave" suffix. Uses `lib/availability.ts` (handles one-off, weekly and block-N-weeks patterns).
- **Admin reject dialog textbox** — already present (required on reject); confirmed working.
- **Copyright footer** — new `<SiteFooter>` component, added to every dashboard page + landing + pricing + privacy + terms. Reads *"© YYYY Rocky’s Retreat and Rambles · Built with ♥ by Jamie Neal. All rights reserved."*


### Feb 2026 (Fork — Bulk approve recurring walks)
- **Admin /admin/bookings** — pending bookings that share a `recurring_template_id` are now collapsed into a single green banner "Client · Pet · Mon/Wed/Fri at 12:30 — N pending walks".
- **"Approve all N" button** assigns the client's preferred walker (pre-filled from the recurring template) to every booking in the group with one click + sends a single summary in-app notification to the client.
- **"Decline all"** with required reason — cascades `cancellation_reason` / `cancelled_by` / `cancelled_at` across every booking and sends one decline notification to the client.
- Individual rows also show a subtle "recurring" pill next to the service name so admin can spot them at a glance in the main table.
- Both bulk actions log single-line audit entries (`bookings_bulk_approved` / `bookings_bulk_rejected`) for traceability.


### Feb 2026 (Fork — Auto-rebook on walk completion)
- **`autoExtendIfLow(booking)` helper** in `lib/availability.ts` — checks how many future pending/confirmed occurrences remain for the booking's recurring template; if fewer than 2 weeks' worth, auto-creates the next 4 weeks of bookings.
- **Walker walk completion hook** — on `Walk Complete` / `Drop off` in `/walker/walks`, if the booking belongs to a recurring template the horizon is auto-refreshed and both the client and all admins get an "auto-extended" in-app notification. Silent no-op when the template is paused, cap-ended, or already healthy.
- Zero admin/client taps required — pairs with the earlier bulk-approve banner so new auto-extended batches surface as a single "Approve all N" row.


### Feb 2026 (Fork — Phase 1: bug-fix + admin tools + heatmap + services CMS)
- **🐛 P0 DATA-LOSS FIX**: Admins editing client/walker/pet cards were silently failing because RLS only allowed the row owner to update. Added `admin_write_policies.sql` migration (admins now have full ALL access on `dogs`, `profiles`, `walker_profiles`). All admin + client save paths now use `.select()` to surface 0-row blocks instead of falsely reporting success.
- **Admin creates recurring walks** — `/admin/recurring` now has a "New regular walk" button with a full dialog: pick client → pet → walker (optional) → days/time/dates. If a walker is assigned, the first 8 weeks are auto-confirmed; otherwise pending. Client + walker both get in-app notifications.
- **Analytics Excel export** — `/admin/analytics` now has an "Export to Excel" button producing a 5-sheet `.xlsx` (Summary KPIs, By Service, Monthly Trend, Walkers, Day of Week).
- **Services CMS** — new migration `20260430_site_services.sql` creates a `site_services` table seeded from the hard-coded WALK_TYPES. New admin page `/admin/services` lets admins add/edit/reorder/price services, toggle bookable/pricing visibility. `/client/book` and `/pricing` now pull from this table (fallback to static list if DB empty).
- **Workload heatmap** — new `WorkloadHeatmap` component above the admin calendar showing walker × day booking counts as a green-intensity grid.


### Feb 2026 (Fork — Soft cap + Phase 2 Site Setup CMS)
- **Walker soft cap on admin bookings** — `/admin/bookings` now shows each walker's load vs. their `max_dogs` cap for the selected booking date. 🛑 = at/over, ⚠️ = near. Non-blocking — admin can still override.
- **Phase 2: Site Setup CMS live** — `/admin/site-setup` (replaces `/admin/site-images`, which is now a redirect). Unified page with tabs per area (Global / Landing / Pricing / Auth) containing editable text + images.
- **New SQL**: `20260430_site_texts.sql` — tiny `site_texts` key/value table with public read + admin write RLS.
- **Reusable `<SiteText>` component** with module-level cache.
- **22 text slots** in `lib/site-texts.ts` across Global / Landing / Pricing / Auth.
- **Editable site logo** — new `site_logo` slot added to `SITE_IMAGE_SLOTS`.
- **Landing rewired** — hero, **new "Meet Rocky" section**, bottom CTA now read from `site_texts`. Pricing hero + bottom CTA likewise.


### Feb 2026 (Fork — Phase 4: Invoices + SiteText 5-min cache)
- **SiteText live-update cache (5 min)** — `<SiteText>` now refreshes every 5 minutes in the background and broadcasts cache invalidations via a pub-sub so copy edits propagate to open tabs without hard reload. Admin saves invalidate instantly.
- **Phase 4 — Invoices dashboard live** — `/admin/invoices` with KPIs (paid this month, issued this month, outstanding, overdue, drafts), status tabs, manual create, auto-fill-from-walks, **auto-generate monthly** (one invoice per client with completed walks for a chosen month).
- **PDF generation** via `jsPDF` + `jspdf-autotable` (client-side, zero-backend). Brand name pulled from `site_texts.brand_name`.
- **Email invoice** — uses existing `bulk-mail` edge function (now supports `attachments`). Marks invoice as sent + records audit.
- **Client invoices view** at `/client/invoices` — RLS scoped to own invoices, self-serve PDF download.
- **New SQL**: `20260430_invoices.sql` — `invoices`, `invoice_items` tables with admin-manage + client-read-own RLS, plus `next_invoice_no()` helper.
- Sidebar updated — "Invoices" links in both admin and client nav.
