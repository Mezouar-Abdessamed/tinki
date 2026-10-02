ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_icon_color text,
  ADD COLUMN IF NOT EXISTS social_icon_bg_color text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_social_icon_color_format,
  DROP CONSTRAINT IF EXISTS profiles_social_icon_bg_color_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_social_icon_color_format CHECK (social_icon_color IS NULL OR social_icon_color ~* '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT profiles_social_icon_bg_color_format CHECK (social_icon_bg_color IS NULL OR social_icon_bg_color ~* '^#[0-9a-f]{6}$');