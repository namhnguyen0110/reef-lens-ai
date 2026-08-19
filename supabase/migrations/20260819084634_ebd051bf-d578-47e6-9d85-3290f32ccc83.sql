CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tank_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  cover_photo_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "areas_own" ON public.areas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.camera_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  camera_id UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  preset_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  settle_ms INTEGER NOT NULL DEFAULT 3000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (camera_id, preset_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.camera_presets TO authenticated;
GRANT ALL ON public.camera_presets TO service_role;
ALTER TABLE public.camera_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camera_presets_own" ON public.camera_presets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  camera_id UUID REFERENCES public.cameras(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_time TEXT,
  interval_minutes INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflows_own" ON public.workflows FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO authenticated;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_steps_own" ON public.workflow_steps FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_workflow_steps_workflow ON public.workflow_steps(workflow_id, position);

CREATE TABLE public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'queued',
  claimed_by UUID,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, scheduled_for)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_runs TO service_role;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_runs_own" ON public.workflow_runs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_workflow_runs_status ON public.workflow_runs(status, scheduled_for);

CREATE TABLE public.workflow_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id UUID,
  position INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  detail TEXT,
  photo_ids UUID[],
  comparison_id UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_run_steps TO authenticated;
GRANT ALL ON public.workflow_run_steps TO service_role;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_run_steps_own" ON public.workflow_run_steps FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_workflow_run_steps_run ON public.workflow_run_steps(run_id, position);

CREATE TABLE public.bridge_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Home bridge',
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT,
  camera_id UUID REFERENCES public.cameras(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bridge_devices TO authenticated;
GRANT ALL ON public.bridge_devices TO service_role;
ALTER TABLE public.bridge_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bridge_devices_own" ON public.bridge_devices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS burst_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_photos_area ON public.photos(area_id, captured_at DESC);