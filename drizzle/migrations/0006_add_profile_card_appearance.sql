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