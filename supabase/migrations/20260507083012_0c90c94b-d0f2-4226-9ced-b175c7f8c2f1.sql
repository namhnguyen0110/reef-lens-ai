
CREATE TABLE public.corals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tank_id UUID REFERENCES public.tanks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  species TEXT,
  notes TEXT,
  cover_photo_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.corals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corals_select_own" ON public.corals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "corals_insert_own" ON public.corals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "corals_update_own" ON public.corals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "corals_delete_own" ON public.corals FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.photos
  ADD COLUMN coral_id UUID REFERENCES public.corals(id) ON DELETE SET NULL,
  ADD COLUMN captured_at TIMESTAMPTZ;

UPDATE public.photos SET captured_at = created_at WHERE captured_at IS NULL;

CREATE INDEX idx_photos_coral_id ON public.photos(coral_id);
CREATE INDEX idx_photos_captured_at ON public.photos(captured_at);
CREATE INDEX idx_corals_user_id ON public.corals(user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER corals_set_updated_at
  BEFORE UPDATE ON public.corals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
