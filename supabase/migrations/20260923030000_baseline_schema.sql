CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  bio text,
  avatar_path text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  snapchat_url text,
  linkedin_url text,
  x_url text,
  youtube_url text,
  whatsapp_url text,
  telegram_url text,
  discord_url text,
  github_url text,
  steam_url text,
  epicgames_url text,
  threads_url text,
  reddit_url text,
  twitch_url text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_-]{1,20}$'),
  CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 50),
  CONSTRAINT profiles_username_not_reserved CHECK (username NOT IN (
    'admin','login','register','dashboard','api','settings','about','contact',
    'terms','privacy','favicon.ico','robots.txt','sitemap.xml','_next',
    'auth','forgot-password','reset-password','profile','signup','signin',
    'logout','help','support','pricing','blog','assets','static','public','me','u','user'
  ))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are publicly viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can delete their own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_username_available(check_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(check_username));
$$;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

CREATE TABLE public.profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  platform text CHECK (platform IN ('instagram','facebook','tiktok','snapchat','linkedin','x','youtube','whatsapp','telegram','discord','github','steam','epicgames','threads','reddit','twitch')),
  visitor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.profile_events TO anon;
GRANT INSERT, SELECT ON public.profile_events TO authenticated;
GRANT ALL ON public.profile_events TO service_role;
ALTER TABLE public.profile_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read their own analytics" ON public.profile_events FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE INDEX profile_events_profile_idx ON public.profile_events (profile_id, event_type, created_at DESC);

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM anon, public;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.custom_links (
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
CREATE POLICY "Enabled custom links are publicly viewable" ON public.custom_links FOR SELECT TO anon USING (enabled = true);
CREATE POLICY "Signed-in users can view enabled or owned custom links" ON public.custom_links FOR SELECT TO authenticated USING (enabled = true OR profile_id = auth.uid());
CREATE POLICY "Owners can create custom links" ON public.custom_links FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Owners can update custom links" ON public.custom_links FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Owners can delete custom links" ON public.custom_links FOR DELETE TO authenticated USING (profile_id = auth.uid());
CREATE TRIGGER custom_links_set_updated_at BEFORE UPDATE ON public.custom_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX custom_links_profile_position_idx ON public.custom_links(profile_id, position, created_at);

CREATE TABLE public.social_link_settings (
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
CREATE POLICY "Social link settings are publicly viewable" ON public.social_link_settings FOR SELECT USING (true);
CREATE POLICY "Owners can create social link settings" ON public.social_link_settings FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Owners can update social link settings" ON public.social_link_settings FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Owners can delete social link settings" ON public.social_link_settings FOR DELETE TO authenticated USING (profile_id = auth.uid());
CREATE TRIGGER social_link_settings_set_updated_at BEFORE UPDATE ON public.social_link_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX social_link_settings_profile_position_idx ON public.social_link_settings(profile_id, position);

CREATE OR REPLACE FUNCTION public.enforce_reserved_verified()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF lower(NEW.username) = 'abdessamed' THEN
    NEW.verified := true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_enforce_reserved_verified
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_reserved_verified();

ALTER TABLE public.profile_events
  ADD COLUMN custom_link_id uuid REFERENCES public.custom_links(id) ON DELETE SET NULL;

ALTER TABLE public.profile_events
  ADD CONSTRAINT profile_events_event_type_check
  CHECK (
    event_type IN ('profile_view', 'social_click', 'custom_link_click')
    AND (event_type <> 'social_click' OR platform IS NOT NULL)
    AND (event_type <> 'custom_link_click' OR custom_link_id IS NOT NULL)
  );

CREATE POLICY "Anonymous visitors can record events" ON public.profile_events
  FOR INSERT TO anon
  WITH CHECK (
    (event_type = 'profile_view' AND platform IS NULL AND custom_link_id IS NULL)
    OR (event_type = 'social_click' AND platform IS NOT NULL AND custom_link_id IS NULL)
    OR (event_type = 'custom_link_click' AND platform IS NULL AND custom_link_id IS NOT NULL)
  );

CREATE POLICY "Signed-in visitors can record events for other profiles" ON public.profile_events
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id <> auth.uid()
    AND (
      (event_type = 'profile_view' AND platform IS NULL AND custom_link_id IS NULL)
      OR (event_type = 'social_click' AND platform IS NOT NULL AND custom_link_id IS NULL)
      OR (event_type = 'custom_link_click' AND platform IS NULL AND custom_link_id IS NOT NULL)
    )
  );

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

CREATE POLICY "Avatar images are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_safe_avatar_object(name, metadata)
  );
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_safe_avatar_object(name, metadata)
  );

ALTER TABLE public.profiles
  ADD COLUMN card_background_type text NOT NULL DEFAULT 'default',
  ADD COLUMN card_background_color text NOT NULL DEFAULT '#222634',
  ADD COLUMN card_gradient_color text NOT NULL DEFAULT '#173D38',
  ADD COLUMN card_gradient_angle integer NOT NULL DEFAULT 135;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_card_background_type_allowed
    CHECK (card_background_type IN ('default', 'solid', 'linear', 'radial')),
  ADD CONSTRAINT profiles_card_background_color_format
    CHECK (card_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT profiles_card_gradient_color_format
    CHECK (card_gradient_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT profiles_card_gradient_angle_range
    CHECK (card_gradient_angle BETWEEN 0 AND 360);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_icon_color text,
  ADD COLUMN IF NOT EXISTS social_icon_bg_color text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_social_icon_color_format CHECK (social_icon_color IS NULL OR social_icon_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_social_icon_bg_color_format CHECK (social_icon_bg_color IS NULL OR social_icon_bg_color ~* '^#[0-9a-f]{6}$');

ALTER TABLE public.profiles
  ADD COLUMN page_background_type text NOT NULL DEFAULT 'solid',
  ADD COLUMN page_background_color text NOT NULL DEFAULT '#10131A',
  ADD COLUMN page_gradient_color text NOT NULL DEFAULT '#173D38',
  ADD COLUMN page_gradient_angle integer NOT NULL DEFAULT 135;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_page_background_type_allowed CHECK (page_background_type IN ('solid', 'linear', 'radial')),
  ADD CONSTRAINT profiles_page_background_color_format CHECK (page_background_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_page_gradient_color_format CHECK (page_gradient_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_page_gradient_angle_range CHECK (page_gradient_angle BETWEEN 0 AND 360);

CREATE OR REPLACE FUNCTION public.validate_profile_event_custom_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.custom_link_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.custom_links cl
      WHERE cl.id = NEW.custom_link_id
        AND cl.profile_id = NEW.profile_id
    ) THEN
      RAISE EXCEPTION 'custom_link_id % does not belong to profile %', NEW.custom_link_id, NEW.profile_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_events_validate_custom_link
BEFORE INSERT OR UPDATE ON public.profile_events
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_event_custom_link();
REVOKE EXECUTE ON FUNCTION public.validate_profile_event_custom_link() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_valid_social_url(url text, allowed_hosts text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  authority text;
  host text;
  rest text;
  entry text;
BEGIN
  IF url IS NULL OR btrim(url) = '' THEN
    RETURN true;
  END IF;

  IF url <> btrim(url) THEN
    RETURN false;
  END IF;

  IF url !~ '^https://' THEN
    RETURN false;
  END IF;

  authority := substring(url from '^https://([^/?#]+)');
  IF authority IS NULL THEN
    RETURN false;
  END IF;

  IF lower(authority) !~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(:[0-9]+)?$' THEN
    RETURN false;
  END IF;

  host := lower(split_part(authority, ':', 1));
  host := regexp_replace(host, '^www\.', '');

  IF position('.' in host) = 0 THEN
    RETURN false;
  END IF;

  rest := substring(url from (length('https://') + length(authority) + 1));

  IF rest !~ '^/[^?#\s]' THEN
    RETURN false;
  END IF;

  FOREACH entry IN ARRAY allowed_hosts LOOP
    IF host = entry OR host LIKE ('%.' || entry) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_social_url(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_social_url(text, text[]) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.validate_profile_social_urls()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_valid_social_url(NEW.instagram_url, ARRAY['instagram.com']) THEN
    RAISE EXCEPTION 'Invalid Instagram URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.facebook_url, ARRAY['facebook.com','fb.com','m.facebook.com']) THEN
    RAISE EXCEPTION 'Invalid Facebook URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.tiktok_url, ARRAY['tiktok.com']) THEN
    RAISE EXCEPTION 'Invalid TikTok URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.snapchat_url, ARRAY['snapchat.com']) THEN
    RAISE EXCEPTION 'Invalid Snapchat URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.linkedin_url, ARRAY['linkedin.com']) THEN
    RAISE EXCEPTION 'Invalid LinkedIn URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.x_url, ARRAY['x.com','twitter.com']) THEN
    RAISE EXCEPTION 'Invalid X URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.youtube_url, ARRAY['youtube.com','youtu.be']) THEN
    RAISE EXCEPTION 'Invalid YouTube URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.whatsapp_url, ARRAY['wa.me','whatsapp.com']) THEN
    RAISE EXCEPTION 'Invalid WhatsApp URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.telegram_url, ARRAY['t.me','telegram.me','telegram.org']) THEN
    RAISE EXCEPTION 'Invalid Telegram URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.discord_url, ARRAY['discord.gg','discord.com','discordapp.com']) THEN
    RAISE EXCEPTION 'Invalid Discord URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.github_url, ARRAY['github.com']) THEN
    RAISE EXCEPTION 'Invalid GitHub URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.steam_url, ARRAY['steamcommunity.com','steampowered.com']) THEN
    RAISE EXCEPTION 'Invalid Steam URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.epicgames_url, ARRAY['epicgames.com']) THEN
    RAISE EXCEPTION 'Invalid Epic Games URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.threads_url, ARRAY['threads.net','threads.com']) THEN
    RAISE EXCEPTION 'Invalid Threads URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.reddit_url, ARRAY['reddit.com']) THEN
    RAISE EXCEPTION 'Invalid Reddit URL' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_valid_social_url(NEW.twitch_url, ARRAY['twitch.tv']) THEN
    RAISE EXCEPTION 'Invalid Twitch URL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_profile_social_urls() FROM PUBLIC;

CREATE TRIGGER profiles_validate_social_urls
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_social_urls();

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

ALTER TABLE public.custom_links
  ADD CONSTRAINT custom_links_profile_position_unique
  UNIQUE (profile_id, position) DEFERRABLE INITIALLY DEFERRED;

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

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_font_family text NOT NULL DEFAULT 'display',
  ADD COLUMN IF NOT EXISTS name_font_weight integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS name_font_style text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS bio_font_family text NOT NULL DEFAULT 'sans',
  ADD COLUMN IF NOT EXISTS bio_font_weight integer NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS bio_font_style text NOT NULL DEFAULT 'normal';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_name_font_family_check CHECK (name_font_family IN ('display','sans','serif','mono','condensed')),
  ADD CONSTRAINT profiles_bio_font_family_check CHECK (bio_font_family IN ('display','sans','serif','mono','condensed')),
  ADD CONSTRAINT profiles_name_font_weight_check CHECK (name_font_weight IN (300,400,500,600,700)),
  ADD CONSTRAINT profiles_bio_font_weight_check CHECK (bio_font_weight IN (300,400,500,600,700)),
  ADD CONSTRAINT profiles_name_font_style_check CHECK (name_font_style IN ('normal','italic')),
  ADD CONSTRAINT profiles_bio_font_style_check CHECK (bio_font_style IN ('normal','italic'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS page_background_image_url text,
  ADD COLUMN IF NOT EXISTS page_background_image_mode text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS page_background_use_image boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_page_background_image_mode_check
  CHECK (page_background_image_mode IN ('cover', 'repeat'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_color text,
  ADD COLUMN IF NOT EXISTS bio_color text,
  ADD COLUMN IF NOT EXISTS page_background_media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS page_background_video_url text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_name_color_format CHECK (name_color IS NULL OR name_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_bio_color_format CHECK (bio_color IS NULL OR bio_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_page_background_media_type_check CHECK (page_background_media_type IN ('image', 'video'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qr_foreground_color text NOT NULL DEFAULT '#0d1117',
  ADD COLUMN IF NOT EXISTS qr_background_color text NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS qr_margin integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qr_error_correction text NOT NULL DEFAULT 'M';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_qr_foreground_color_check,
  DROP CONSTRAINT IF EXISTS profiles_qr_background_color_check,
  DROP CONSTRAINT IF EXISTS profiles_qr_margin_check,
  DROP CONSTRAINT IF EXISTS profiles_qr_error_correction_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_qr_foreground_color_check CHECK (qr_foreground_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_qr_background_color_check CHECK (qr_background_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_qr_margin_check CHECK (qr_margin BETWEEN 0 AND 8),
  ADD CONSTRAINT profiles_qr_error_correction_check CHECK (qr_error_correction IN ('L','M','Q','H'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qr_module_shape text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS qr_eye_shape text NOT NULL DEFAULT 'square';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_qr_module_shape_check
  CHECK (qr_module_shape IN ('square','rounded','dots','classy','diamond'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_qr_eye_shape_check
  CHECK (qr_eye_shape IN ('square','rounded','circle','leaf'));