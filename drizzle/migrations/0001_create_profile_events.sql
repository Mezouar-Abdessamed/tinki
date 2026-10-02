-- =============================================================
-- LEGACY / UNUSED — DO NOT RUN.
-- supabase/migrations is the authoritative schema source.
-- This file is kept for history only and may be OUT OF DATE
-- (it does not reflect the live database schema).
-- =============================================================
CREATE TABLE public.profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('profile_view', 'social_click')),
  platform text CHECK (platform IN ('instagram','facebook','tiktok','snapchat','linkedin','x')),
  visitor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_events_profile_idx ON public.profile_events (profile_id, event_type, created_at DESC);

GRANT INSERT ON public.profile_events TO anon;
GRANT INSERT, SELECT ON public.profile_events TO authenticated;
GRANT ALL ON public.profile_events TO service_role;

ALTER TABLE public.profile_events ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors may only append events; a social_click must name a platform.
CREATE POLICY "Anonymous visitors can record events"
ON public.profile_events FOR INSERT TO anon
WITH CHECK (
  (event_type = 'profile_view' AND platform IS NULL)
  OR (event_type = 'social_click' AND platform IS NOT NULL)
);

-- Signed-in visitors may record events for anyone except themselves,
-- so a profile owner can never inflate their own analytics.
CREATE POLICY "Signed-in visitors can record events for other profiles"
ON public.profile_events FOR INSERT TO authenticated
WITH CHECK (
  profile_id <> auth.uid()
  AND (
    (event_type = 'profile_view' AND platform IS NULL)
    OR (event_type = 'social_click' AND platform IS NOT NULL)
  )
);

-- Only the profile owner can read their own analytics.
CREATE POLICY "Owners can read their own analytics"
ON public.profile_events FOR SELECT TO authenticated
USING (profile_id = auth.uid());