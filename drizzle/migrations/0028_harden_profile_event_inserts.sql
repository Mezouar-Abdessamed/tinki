CREATE INDEX IF NOT EXISTS profile_events_visitor_idx
  ON public.profile_events (profile_id, visitor_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_profile_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limits apply to browser clients only; trusted server writes pass through.
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- Clients cannot choose ids or backdate events.
  NEW.id := gen_random_uuid();
  NEW.created_at := now();

  IF NEW.visitor_id IS NULL THEN
    RAISE EXCEPTION 'visitor_id is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.profile_id) THEN
    RAISE EXCEPTION 'unknown profile' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.event_type <> 'profile_view' AND NEW.country IS NOT NULL THEN
    RAISE EXCEPTION 'country is only allowed on profile_view' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.event_type = 'custom_link_click' AND NOT EXISTS (
    SELECT 1 FROM public.custom_links cl
    WHERE cl.id = NEW.custom_link_id
      AND cl.profile_id = NEW.profile_id
      AND cl.enabled
  ) THEN
    RAISE EXCEPTION 'custom link is not available' USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize concurrent inserts from the same visitor on the same profile.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.profile_id::text || NEW.visitor_id::text, 0));

  -- Duplicates: one view per visitor/profile per 24h, one click per visitor/target per 10 min.
  IF EXISTS (
    SELECT 1 FROM public.profile_events e
    WHERE e.profile_id = NEW.profile_id
      AND e.visitor_id = NEW.visitor_id
      AND e.event_type = NEW.event_type
      AND e.platform IS NOT DISTINCT FROM NEW.platform
      AND e.custom_link_id IS NOT DISTINCT FROM NEW.custom_link_id
      AND e.created_at > now() - CASE WHEN NEW.event_type = 'profile_view'
                                      THEN interval '24 hours'
                                      ELSE interval '10 minutes' END
  ) THEN
    RAISE EXCEPTION 'duplicate event' USING ERRCODE = 'unique_violation';
  END IF;

  -- Per-visitor rate: 30 events per profile per minute.
  IF (
    SELECT count(*) FROM public.profile_events e
    WHERE e.profile_id = NEW.profile_id
      AND e.visitor_id = NEW.visitor_id
      AND e.created_at > now() - interval '1 minute'
  ) >= 30 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'check_violation';
  END IF;

  -- Per-profile flood cap (rotating visitor ids): 600 events per minute.
  IF (
    SELECT count(*) FROM public.profile_events e
    WHERE e.profile_id = NEW.profile_id
      AND e.created_at > now() - interval '1 minute'
  ) >= 600 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_profile_event_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profile_events_guard_insert ON public.profile_events;
CREATE TRIGGER profile_events_guard_insert
BEFORE INSERT ON public.profile_events
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_event_insert();