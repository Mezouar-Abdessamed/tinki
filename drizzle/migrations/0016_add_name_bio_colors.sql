ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_color text,
  ADD COLUMN IF NOT EXISTS bio_color text;