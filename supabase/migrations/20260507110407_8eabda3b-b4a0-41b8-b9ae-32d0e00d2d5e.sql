ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS source_photo_id uuid REFERENCES public.photos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS crop_box jsonb;

CREATE INDEX IF NOT EXISTS photos_source_photo_id_idx ON public.photos(source_photo_id);