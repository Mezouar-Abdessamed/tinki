-- =============================================================
-- LEGACY / UNUSED — DO NOT RUN.
-- supabase/migrations is the authoritative schema source.
-- This file is kept for history only and may be OUT OF DATE
-- (it does not reflect the live database schema).
-- =============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_url text,
  ADD COLUMN IF NOT EXISTS telegram_url text,
  ADD COLUMN IF NOT EXISTS discord_url text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS steam_url text,
  ADD COLUMN IF NOT EXISTS epicgames_url text,
  ADD COLUMN IF NOT EXISTS threads_url text,
  ADD COLUMN IF NOT EXISTS reddit_url text,
  ADD COLUMN IF NOT EXISTS twitch_url text;

ALTER TABLE public.profile_events DROP CONSTRAINT IF EXISTS profile_events_platform_check;

ALTER TABLE public.profile_events
  ADD CONSTRAINT profile_events_platform_check CHECK (
    platform IN (
      'instagram','facebook','tiktok','snapchat','linkedin','x',
      'youtube','whatsapp','telegram','discord','github','steam',
      'epicgames','threads','reddit','twitch'
    )
  );