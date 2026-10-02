ALTER TABLE public.profiles ADD COLUMN cover_photo_path text;
ALTER TABLE public.profiles ADD COLUMN cover_photo_x integer NOT NULL DEFAULT 50 CHECK (cover_photo_x BETWEEN 0 AND 100);
ALTER TABLE public.profiles ADD COLUMN cover_photo_y integer NOT NULL DEFAULT 50 CHECK (cover_photo_y BETWEEN 0 AND 100);