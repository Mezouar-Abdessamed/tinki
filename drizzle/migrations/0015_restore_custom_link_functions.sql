CREATE OR REPLACE FUNCTION public.reorder_custom_links(target_profile_id uuid, ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  supplied_count int;
  distinct_count int;
  owned_count int;
  total_count int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> target_profile_id THEN
    RAISE EXCEPTION 'Not authorized to reorder links for this profile'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF ordered_ids IS NULL THEN
    RAISE EXCEPTION 'No link order supplied' USING ERRCODE = 'check_violation';
  END IF;

  supplied_count := array_length(ordered_ids, 1);
  IF supplied_count IS NULL THEN
    supplied_count := 0;
  END IF;

  SELECT count(DISTINCT id) INTO distinct_count FROM unnest(ordered_ids) AS id;
  IF distinct_count <> supplied_count THEN
    RAISE EXCEPTION 'Duplicate custom link ids supplied' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO owned_count
  FROM public.custom_links cl
  WHERE cl.profile_id = target_profile_id
    AND cl.id = ANY(ordered_ids);

  IF owned_count <> supplied_count THEN
    RAISE EXCEPTION 'One or more custom links do not belong to this profile'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO total_count
  FROM public.custom_links cl
  WHERE cl.profile_id = target_profile_id;

  IF total_count <> supplied_count THEN
    RAISE EXCEPTION 'The complete set of custom links must be supplied'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.custom_links cl
  SET position = ord.new_position
  FROM (
    SELECT id, (ordinality - 1)::int AS new_position
    FROM unnest(ordered_ids) WITH ORDINALITY AS t(id, ordinality)
  ) AS ord
  WHERE cl.id = ord.id
    AND cl.profile_id = target_profile_id
    AND cl.position IS DISTINCT FROM ord.new_position;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_custom_links(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_custom_links(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_custom_links(uuid, uuid[]) TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'custom_links_profile_position_unique'
      AND conrelid = 'public.custom_links'::regclass
  ) THEN
    ALTER TABLE public.custom_links
      ADD CONSTRAINT custom_links_profile_position_unique
      UNIQUE (profile_id, position) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.create_custom_link(
  link_name text,
  link_url text,
  link_icon text DEFAULT 'globe',
  link_type text DEFAULT 'link'
)
RETURNS public.custom_links
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
  next_position int;
  created public.custom_links;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to create custom links'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = owner_id) THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('custom_links_position'), hashtext(owner_id::text));

  SELECT COALESCE(max(cl.position) + 1, 0) INTO next_position
  FROM public.custom_links cl
  WHERE cl.profile_id = owner_id;

  INSERT INTO public.custom_links (profile_id, name, url, icon, link_type, position)
  VALUES (owner_id, link_name, link_url, COALESCE(link_icon, 'globe'), COALESCE(link_type, 'link'), next_position)
  RETURNING * INTO created;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_custom_link(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_link(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_link(text, text, text, text) TO service_role;