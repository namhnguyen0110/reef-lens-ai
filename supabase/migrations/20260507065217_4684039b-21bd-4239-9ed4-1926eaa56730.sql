
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS likely_causes jsonb,
  ADD COLUMN IF NOT EXISTS next_step text;
