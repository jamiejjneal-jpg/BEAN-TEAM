# Supabase Edge Functions — Deployment Guide

This app sends transactional emails and weekly digests via **three Supabase Edge Functions**:

- **`notify`** — fired on booking approve/reject, client pickup/dropoff, and new booking requests
- **`weekly-digest`** — admin KPI report + per-client walk summary; on-demand or scheduled via Supabase Cron
- **`admin-ops`** — privileged admin actions: create admin, change a user's role (admin ↔ walker ↔ client), delete any user

All three live under `/app/supabase/functions/<name>/index.ts`.

---

## 1. Install the Supabase CLI (one time)

```bash
# macOS
brew install supabase/tap/supabase

# Windows (scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux / other
npm install -g supabase
```

Verify: `supabase --version`

---

## 2. Log in and link the project

```bash
supabase login                        # opens a browser for OAuth
cd /path/to/your/project              # repo root (the one that has /supabase/functions)
supabase link --project-ref udoeczxwrnmqbxtzybmt
```

(`udoeczxwrnmqbxtzybmt` is your existing Supabase project ref — taken from your project URL.)

---

## 3. Set the required secrets

```bash
supabase secrets set \
  RESEND_API_KEY="<your Resend API key>" \
  SENDER_EMAIL="Rocky's Retreat and Rambles <notifications@yourdomain.com>" \
  APP_URL="https://ink-validator.emergent.host" \
  CRON_SECRET="$(openssl rand -hex 32)"
```

- **`RESEND_API_KEY`** — from https://resend.com/api-keys
- **`SENDER_EMAIL`** — must be from a **domain you've verified in Resend** so emails can reach real clients/walkers. While using `onboarding@resend.dev`, you can only email the Resend account owner.
- **`APP_URL`** — public URL used in email CTA buttons.
- **`CRON_SECRET`** — random token used to authorize the scheduled run. Save this somewhere safe.

Supabase auto-provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to every function — do NOT set these manually.

---

## 4. Deploy the Edge Functions

```bash
supabase functions deploy notify
supabase functions deploy weekly-digest
supabase functions deploy admin-ops
```

After deploy, each function is reachable at:

```
https://udoeczxwrnmqbxtzybmt.functions.supabase.co/notify
https://udoeczxwrnmqbxtzybmt.functions.supabase.co/weekly-digest
https://udoeczxwrnmqbxtzybmt.functions.supabase.co/admin-ops
```

They're called from the app via `supabase.functions.invoke('<name>', ...)` — no URL changes needed.

---

## 5. Schedule the weekly digest (optional but recommended)

Go to **Supabase Studio → Database → Cron** and create a new job:

- **Name**: `weekly-digest-sunday`
- **Schedule**: `0 18 * * 0` (every Sunday 18:00 UTC; adjust for your timezone)
- **Type**: `HTTP Request`
- **URL**: `https://udoeczxwrnmqbxtzybmt.functions.supabase.co/weekly-digest`
- **Method**: `POST`
- **HTTP Headers**:
  - `Authorization: Bearer <the CRON_SECRET you generated in step 3>`
  - `Content-Type: application/json`
- **Body**: `{}`

Click **Save**. That's it — every Sunday evening admins get the KPI report and active clients get their personalised walk digest.

---

## 6. Test

Log in as admin, go to the dashboard, click **"Weekly report"** (bottom of the stats area). You should see a toast like:

> Digest sent · 1 admin, 0 clients

Then check your admin email inbox.

Pickup / dropoff emails: mark a booking as "Picked up" from the walker's Walks page — the client should receive an email within a few seconds.

---

## Troubleshooting

- **No email received** — check the function logs via `supabase functions logs notify` (or in Supabase Studio → Edge Functions → Logs). Usually the Resend sender domain isn't verified, or `RESEND_API_KEY` wasn't set.
- **"Unauthorized" toast on the Weekly report button** — you're signed in as a non-admin account. Switch to an admin or update `profiles.role` in the database.
- **"Booking not found"** — the `booking_id` passed to `notify` doesn't exist (should never happen, but double-check the DB hasn't been reset).
