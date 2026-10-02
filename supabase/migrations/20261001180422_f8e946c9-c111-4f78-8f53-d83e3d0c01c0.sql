ALTER TABLE public.profile_events ADD COLUMN country text;

ALTER TABLE public.profile_events
  ADD CONSTRAINT profile_events_country_format
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

CREATE INDEX profile_events_country_idx
  ON public.profile_events (profile_id, country)
  WHERE event_type = 'profile_view' AND country IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_profile_analytics(target_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT event_type, platform, visitor_id, custom_link_id, country
    FROM public.profile_events
    WHERE profile_id = target_profile_id
      AND target_profile_id = auth.uid()
  )
  SELECT jsonb_build_object(
    'views', (
      (SELECT count(DISTINCT visitor_id) FROM ev WHERE event_type = 'profile_view' AND visitor_id IS NOT NULL)
      + (SELECT count(*) FROM ev WHERE event_type = 'profile_view' AND visitor_id IS NULL)
    ),
    'clicks', (SELECT count(*) FROM ev WHERE event_type = 'social_click'),
    'byPlatform', COALESCE((
      SELECT jsonb_object_agg(platform, c) FROM (
        SELECT platform, count(*) AS c FROM ev
        WHERE event_type = 'social_click' AND platform IS NOT NULL
        GROUP BY platform
      ) p
    ), '{}'::jsonb),
    'customLinkClicks', (SELECT count(*) FROM ev WHERE event_type = 'custom_link_click'),
    'byCustomLink', COALESCE((
      SELECT jsonb_object_agg(custom_link_id::text, c) FROM (
        SELECT custom_link_id, count(*) AS c FROM ev
        WHERE event_type = 'custom_link_click' AND custom_link_id IS NOT NULL
        GROUP BY custom_link_id
      ) l
    ), '{}'::jsonb),
    'byCountry', COALESCE((
      SELECT jsonb_object_agg(country, c) FROM (
        SELECT country, count(*) AS c FROM ev
        WHERE event_type = 'profile_view' AND country IS NOT NULL
        GROUP BY country
        ORDER BY c DESC, country
      ) co
    ), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_profile_analytics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_analytics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_analytics(uuid) TO service_role;