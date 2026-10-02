ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS page_background_image_url text,
  ADD COLUMN IF NOT EXISTS page_background_image_mode text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS page_background_use_image boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_page_background_image_mode_check
  CHECK (page_background_image_mode IN ('cover', 'repeat'));