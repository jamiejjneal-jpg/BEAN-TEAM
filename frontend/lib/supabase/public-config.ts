// Public Supabase configuration — hardcoded fallbacks so the app deploys
// without any dashboard env-var setup. These are the SAME values your browser
// already receives at runtime; they are designed to be public and are
// protected by Postgres Row Level Security.
//
// DO NOT add any secret keys here (service_role key, Resend key, cron secret).
// Those still come exclusively from the deployment platform's env vars.
export const PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://udoeczxwrnmqbxtzybmt.supabase.co'

export const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkb2Vjenh3cm5tcWJ4dHp5Ym10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNzc5MDUsImV4cCI6MjA5MTY1MzkwNX0._KrkXTbY-YG3R_jO8ys3BUnmj1Ipv6qTNdLstaD10wI'
