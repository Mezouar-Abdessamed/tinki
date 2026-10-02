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