ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_font_family text NOT NULL DEFAULT 'display',
  ADD COLUMN IF NOT EXISTS name_font_weight integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS name_font_style text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS bio_font_family text NOT NULL DEFAULT 'sans',
  ADD COLUMN IF NOT EXISTS bio_font_weight integer NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS bio_font_style text NOT NULL DEFAULT 'normal';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_name_font_family_check,
  DROP CONSTRAINT IF EXISTS profiles_bio_font_family_check,
  DROP CONSTRAINT IF EXISTS profiles_name_font_weight_check,
  DROP CONSTRAINT IF EXISTS profiles_bio_font_weight_check,
  DROP CONSTRAINT IF EXISTS profiles_name_font_style_check,
  DROP CONSTRAINT IF EXISTS profiles_bio_font_style_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_name_font_family_check CHECK (name_font_family IN ('display','sans','serif','mono','condensed')),
  ADD CONSTRAINT profiles_bio_font_family_check CHECK (bio_font_family IN ('display','sans','serif','mono','condensed')),
  ADD CONSTRAINT profiles_name_font_weight_check CHECK (name_font_weight IN (300,400,500,600,700)),
  ADD CONSTRAINT profiles_bio_font_weight_check CHECK (bio_font_weight IN (300,400,500,600,700)),
  ADD CONSTRAINT profiles_name_font_style_check CHECK (name_font_style IN ('normal','italic')),
  ADD CONSTRAINT profiles_bio_font_style_check CHECK (bio_font_style IN ('normal','italic'));