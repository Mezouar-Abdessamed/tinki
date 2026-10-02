-- profiles: bio + constraint updates
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 50);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_-]{1,20}$');

-- roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM anon, public;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- custom links
CREATE TABLE IF NOT EXISTS public.custom_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  icon text NOT NULL DEFAULT 'globe',
  enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  link_type text NOT NULL DEFAULT 'link',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_links_name_length CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  CONSTRAINT custom_links_url_length CHECK (char_length(url) BETWEEN 1 AND 2048),
  CONSTRAINT custom_links_icon_allowed CHECK (icon IN ('globe','portfolio','email','phone','store','shopping','music','video','camera','code','document','education','location','calendar','link','heart','game','book','star')),
  CONSTRAINT custom_links_position_nonnegative CHECK (position >= 0),
  CONSTRAINT custom_links_type_allowed CHECK (link_type IN ('link', 'phone', 'email'))
);
GRANT SELECT ON public.custom_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_links TO authenticated;
GRANT ALL ON public.custom_links TO service_role;
ALTER TABLE public.custom_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enabled custom links are publicly viewable" ON public.custom_links;
CREATE POLICY "Enabled custom links are publicly viewable" ON public.custom_links FOR SELECT TO anon USING (enabled = true);
DROP POLICY IF EXISTS "Signed-in users can view enabled or owned custom links" ON public.custom_links;
CREATE POLICY "Signed-in users can view enabled or owned custom links" ON public.custom_links FOR SELECT TO authenticated USING (enabled = true OR profile_id = auth.uid());
DROP POLICY IF EXISTS "Owners can create custom links" ON public.custom_links;
CREATE POLICY "Owners can create custom links" ON public.custom_links FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "Owners can update custom links" ON public.custom_links;
CREATE POLICY "Owners can update custom links" ON public.custom_links FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "Owners can delete custom links" ON public.custom_links;
CREATE POLICY "Owners can delete custom links" ON public.custom_links FOR DELETE TO authenticated USING (profile_id = auth.uid());
DROP TRIGGER IF EXISTS custom_links_set_updated_at ON public.custom_links;
CREATE TRIGGER custom_links_set_updated_at BEFORE UPDATE ON public.custom_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS custom_links_profile_position_idx ON public.custom_links(profile_id, position, created_at);

-- social link settings
CREATE TABLE IF NOT EXISTS public.social_link_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_link_settings_platform_allowed CHECK (platform IN ('instagram','facebook','tiktok','snapchat','linkedin','x','youtube','whatsapp','telegram','discord','github','steam','epicgames','threads','reddit','twitch')),
  CONSTRAINT social_link_settings_position_nonnegative CHECK (position >= 0),
  UNIQUE (profile_id, platform)
);
GRANT SELECT ON public.social_link_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_link_settings TO authenticated;
GRANT ALL ON public.social_link_settings TO service_role;
ALTER TABLE public.social_link_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Social link settings are publicly viewable" ON public.social_link_settings;
CREATE POLICY "Social link settings are publicly viewable" ON public.social_link_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can create social link settings" ON public.social_link_settings;
CREATE POLICY "Owners can create social link settings" ON public.social_link_settings FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "Owners can update social link settings" ON public.social_link_settings;
CREATE POLICY "Owners can update social link settings" ON public.social_link_settings FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "Owners can delete social link settings" ON public.social_link_settings;
CREATE POLICY "Owners can delete social link settings" ON public.social_link_settings FOR DELETE TO authenticated USING (profile_id = auth.uid());
DROP TRIGGER IF EXISTS social_link_settings_set_updated_at ON public.social_link_settings;
CREATE TRIGGER social_link_settings_set_updated_at BEFORE UPDATE ON public.social_link_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS social_link_settings_profile_position_idx ON public.social_link_settings(profile_id, position);

-- reserved verified username
CREATE OR REPLACE FUNCTION public.enforce_reserved_verified()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF lower(NEW.username) = 'abdessamed' THEN
    NEW.verified := true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_enforce_reserved_verified ON public.profiles;
CREATE TRIGGER profiles_enforce_reserved_verified
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_reserved_verified();

-- profile_events: custom link support
ALTER TABLE public.profile_events
  ADD COLUMN IF NOT EXISTS custom_link_id uuid REFERENCES public.custom_links(id) ON DELETE SET NULL;

DELETE FROM public.profile_events
WHERE event_type = 'custom_link_click' AND custom_link_id IS NULL;

ALTER TABLE public.profile_events DROP CONSTRAINT IF EXISTS profile_events_event_type_check;
ALTER TABLE public.profile_events
  ADD CONSTRAINT profile_events_event_type_check
  CHECK (
    event_type IN ('profile_view', 'social_click', 'custom_link_click')
    AND (event_type <> 'social_click' OR platform IS NOT NULL)
    AND (event_type <> 'custom_link_click' OR custom_link_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "Anonymous visitors can record events" ON public.profile_events;
CREATE POLICY "Anonymous visitors can record events" ON public.profile_events
  FOR INSERT TO anon
  WITH CHECK (
    (event_type = 'profile_view' AND platform IS NULL)
    OR (event_type = 'social_click' AND platform IS NOT NULL)
    OR (event_type = 'custom_link_click' AND platform IS NULL AND custom_link_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "Signed-in visitors can record events for other profiles" ON public.profile_events;
CREATE POLICY "Signed-in visitors can record events for other profiles" ON public.profile_events
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id <> auth.uid()
    AND (
      (event_type = 'profile_view' AND platform IS NULL)
      OR (event_type = 'social_click' AND platform IS NOT NULL)
      OR (event_type = 'custom_link_click' AND platform IS NULL AND custom_link_id IS NOT NULL)
    )
  );

-- analytics function
CREATE OR REPLACE FUNCTION public.get_profile_analytics(target_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT event_type, platform, visitor_id, custom_link_id
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
    ), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_profile_analytics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_analytics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_analytics(uuid) TO service_role;

-- avatar upload safety
CREATE OR REPLACE FUNCTION public.is_safe_avatar_object(object_name text, object_metadata jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(object_name) ~ '\.(jpg|jpeg|png|webp)$'
     AND (
       object_metadata IS NULL
       OR object_metadata->>'mimetype' IS NULL
       OR lower(object_metadata->>'mimetype') IN ('image/jpeg','image/png','image/webp')
     );
$$;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_safe_avatar_object(name, metadata)
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_safe_avatar_object(name, metadata)
  );