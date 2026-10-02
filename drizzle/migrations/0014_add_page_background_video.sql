ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS page_background_video_url text,
  ADD COLUMN IF NOT EXISTS page_background_media_type text NOT NULL DEFAULT 'image';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_page_background_media_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_page_background_media_type_check
  CHECK (page_background_media_type IN ('image', 'video'));