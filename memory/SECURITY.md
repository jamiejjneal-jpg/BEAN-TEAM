# Security Runbook — Rocky's Retreat and Rambles

## 🔑 Where every secret lives

| Secret | Location | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `frontend/.env.local` | Frontend (public, safe to expose) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env.local` | Frontend (public, RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function secrets | `admin-ops`, `bulk-mail`, `notification-digest`, `db-backup` Edge Functions only |
| `RESEND_API_KEY` | Supabase Edge Function secrets | All email-sending Edge Functions |
| `SENDER_EMAIL` | Supabase Edge Function secrets | All email-sending Edge Functions |
| `BACKUP_DESTINATION_EMAIL` | Supabase Edge Function secrets | `db-backup` Edge Function |

> **Critical**: the `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. If leaked, the holder can read/write all data.

---

## 🚨 If a secret is leaked — rotation runbook

### Service-role key leaked
1. Supabase dashboard → Project Settings → API → click **"Reset Service Role Key"**
2. Copy the new key
3. Update **every Edge Function** that uses it: dashboard → Edge Functions → Secrets → replace `SUPABASE_SERVICE_ROLE_KEY`
4. Redeploy each affected Edge Function (or re-save secrets — Supabase auto-restarts)
5. Audit `audit_log` table for unusual entries from the time of leak
6. If suspicious activity found: notify affected users within 72 hours (UK GDPR breach window)

### Anon key leaked
The anon key is public-by-design — exposing it isn't a breach, RLS protects the data. **However**, if you suspect RLS misconfiguration:
1. Run the Health Check page (`/admin/health`) to verify RLS is active on every table
2. Rotate the anon key the same way as service-role if you want a clean break

### Resend API key leaked
1. Resend dashboard → API Keys → Revoke
2. Generate new key
3. Update Supabase Edge Function secret `RESEND_API_KEY`

### Database password leaked
1. Supabase dashboard → Project Settings → Database → Reset password
2. Update any direct-PG connection strings (none in current app — we use the JS SDK)

### Admin user account compromised
1. Supabase dashboard → Authentication → Users → click the user → **Sign out user from all devices**
2. Reset their password via "Send password recovery"
3. Review `login_history` table for the user — note any unusual IPs / devices
4. Review `audit_log` for any destructive actions taken during the suspected compromise window
5. Restore from backup if needed (see Backups section)

---

## 🛡️ Hardening checklist (review every 6 months)

- [ ] Run `/admin/health` — every check should be green
- [ ] Verify RLS is enabled on: `profiles`, `dogs`, `bookings`, `walk_logs`, `notifications`, `audit_log`, `notification_prefs`, `login_history`, `email_automations`
- [ ] Confirm no `SECURITY DEFINER` views/functions expose data
- [ ] Test password reset flow end-to-end
- [ ] Test a fresh client signup → can only see their own data
- [ ] Test a fresh walker signup → can only see assigned bookings
- [ ] Confirm backups arrived via email this week (`db-backup` Edge Function)

---

## 💾 Backups

Automated weekly via the `db-backup` Edge Function (runs every Sunday 03:00 UK time).

**Manually trigger a backup:**
```bash
curl -X POST 'https://udoeczxwrnmqbxtzybmt.supabase.co/functions/v1/db-backup' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Restore from backup:**
1. Open the JSON attachment from the most recent backup email
2. Use the Supabase Table Editor → Insert rows from JSON, OR
3. Run `INSERT INTO ... SELECT FROM jsonb_array_elements(...)` from the JSON contents in the SQL editor

> **Recommended upgrade**: Supabase Pro ($25/mo) adds automatic Point-in-Time Recovery (PITR) for 7 days — far better than weekly JSON snapshots.

---

## 📋 Incident-response template

When something happens, use this structure:

1. **Detect** — what's the alert? (Sentry / customer email / health check failure)
2. **Triage** — high (data loss / breach) / medium (degraded UX) / low (cosmetic)
3. **Contain** — stop the bleeding (revoke key, block IP, disable Edge Function)
4. **Eradicate** — fix the root cause in code / config
5. **Recover** — verify normal operation; restore data if needed
6. **Lessons learned** — document in `/app/memory/CHANGELOG.md`; update this runbook if a new threat emerged

---

## 📞 Useful contacts

- **Supabase support**: support@supabase.io (Pro-tier customers get faster SLA)
- **Resend support**: support@resend.com
- **UK ICO** (data breach notification): https://ico.org.uk/for-organisations/report-a-breach/
- **Cloudflare support**: through the dashboard (auth required)
