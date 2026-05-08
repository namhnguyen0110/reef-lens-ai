CREATE TABLE public.comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  photo_older_id uuid NOT NULL,
  photo_newer_id uuid NOT NULL,
  summary text NOT NULL,
  trend text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comparisons_select_own" ON public.comparisons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "comparisons_insert_own" ON public.comparisons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comparisons_update_own" ON public.comparisons FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "comparisons_delete_own" ON public.comparisons FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_comparisons_photo_older ON public.comparisons(photo_older_id);
CREATE INDEX idx_comparisons_photo_newer ON public.comparisons(photo_newer_id);
CREATE INDEX idx_comparisons_user ON public.comparisons(user_id, created_at DESC);