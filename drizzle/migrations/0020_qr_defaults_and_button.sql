ALTER TABLE public.profiles ALTER COLUMN qr_margin SET DEFAULT 4;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_qr_button boolean NOT NULL DEFAULT true;