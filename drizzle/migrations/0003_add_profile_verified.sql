-- =============================================================
-- LEGACY / UNUSED — DO NOT RUN.
-- supabase/migrations is the authoritative schema source.
-- This file is kept for history only and may be OUT OF DATE
-- (it does not reflect the live database schema).
-- =============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;