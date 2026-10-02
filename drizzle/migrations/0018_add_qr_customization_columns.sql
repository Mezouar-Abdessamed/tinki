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