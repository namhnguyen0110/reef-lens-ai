
-- Tanks table
CREATE TABLE public.tanks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tanks_select_own" ON public.tanks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tanks_insert_own" ON public.tanks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tanks_update_own" ON public.tanks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tanks_delete_own" ON public.tanks FOR DELETE USING (auth.uid() = user_id);

-- Photos / analyses
CREATE TABLE public.photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tank_id UUID REFERENCES public.tanks(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  quality_sharpness TEXT,
  quality_lighting TEXT,
  quality_coverage TEXT,
  quality_stability TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|analyzing|done|error
  diagnosis TEXT,
  confidence NUMERIC,
  severity TEXT,
  affected_area TEXT,
  explanation TEXT,
  alternatives JSONB,
  treatment_plan JSONB,
  raw_ai JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos_select_own" ON public.photos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "photos_insert_own" ON public.photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "photos_update_own" ON public.photos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "photos_delete_own" ON public.photos FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX photos_user_created_idx ON public.photos(user_id, created_at DESC);
CREATE INDEX photos_tank_idx ON public.photos(tank_id);

-- Storage bucket for tank photos
INSERT INTO storage.buckets (id, name, public) VALUES ('tank-photos', 'tank-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tank_photos_select_public" ON storage.objects FOR SELECT
USING (bucket_id = 'tank-photos');
CREATE POLICY "tank_photos_insert_own" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tank-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "tank_photos_update_own" ON storage.objects FOR UPDATE
USING (bucket_id = 'tank-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "tank_photos_delete_own" ON storage.objects FOR DELETE
USING (bucket_id = 'tank-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
