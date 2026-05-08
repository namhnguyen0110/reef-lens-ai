CREATE TABLE IF NOT EXISTS public.cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tank_id uuid,
  name text NOT NULL,
  brand text NOT NULL DEFAULT 'mock',
  connection_type text NOT NULL DEFAULT 'mock',
  connection_url text,
  status text NOT NULL DEFAULT 'online',
  mock_seed int NOT NULL DEFAULT 1,
  snapshot_interval_minutes int NOT NULL DEFAULT 60,
  active_window_start time,
  active_window_end time,
  last_snapshot_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cameras_select_own ON public.cameras;
DROP POLICY IF EXISTS cameras_insert_own ON public.cameras;
DROP POLICY IF EXISTS cameras_update_own ON public.cameras;
DROP POLICY IF EXISTS cameras_delete_own ON public.cameras;

CREATE POLICY cameras_select_own ON public.cameras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cameras_insert_own ON public.cameras FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cameras_update_own ON public.cameras FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY cameras_delete_own ON public.cameras FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS cameras_set_updated_at ON public.cameras;
CREATE TRIGGER cameras_set_updated_at
BEFORE UPDATE ON public.cameras
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS camera_id uuid;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS auto_captured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_photos_camera_id ON public.photos(camera_id);