import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera as CameraIcon, Clock, Sparkles, Wifi, WifiOff, Settings2, History } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { mockLiveUrl, mockSnapshotUrl, INTERVAL_OPTIONS, isWithinWindow } from "@/lib/mock-camera";
import { toast } from "sonner";

export const Route = createFileRoute("/cameras/$id")({
  component: CameraDetail,
  head: () => ({ meta: [{ title: "Live View — Reef Tank AI" }] }),
});

type Camera = {
  id: string; name: string; brand: string; status: string;
  mock_seed: number; tank_id: string | null;
  snapshot_interval_minutes: number;
  active_window_start: string | null; active_window_end: string | null;
  last_snapshot_at: string | null;
};

type Snap = { id: string; image_url: string; captured_at: string | null; diagnosis: string | null };

function CameraDetail() {
  const { id } = useParams({ from: "/cameras/$id" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [cam, setCam] = useState<Camera | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [tab, setTab] = useState<"live" | "schedule" | "timeline">("live");
  const [tick, setTick] = useState(0);
  const lastAutoRef = useRef<number>(Date.now());

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const loadCam = async () => {
    const { data } = await supabase.from("cameras").select("*").eq("id", id).maybeSingle();
    setCam(data as Camera | null);
  };
  const loadSnaps = async () => {
    const { data } = await supabase.from("photos")
      .select("id,image_url,captured_at,diagnosis")
      .eq("camera_id", id)
      .order("captured_at", { ascending: false })
      .limit(40);
    setSnaps((data as Snap[]) ?? []);
  };

  useEffect(() => { if (session) { loadCam(); loadSnaps(); } }, [session, id]);

  // Live preview refresh tick
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(i);
  }, []);

  // Scheduler — runs while tab open. Real prod would run server-side via pg_cron.
  useEffect(() => {
    if (!cam || !session) return;
    const i = setInterval(async () => {
      const now = Date.now();
      const intervalMs = cam.snapshot_interval_minutes * 60 * 1000;
      if (now - lastAutoRef.current < intervalMs) return;
      if (!isWithinWindow(new Date(), cam.active_window_start, cam.active_window_end)) return;
      lastAutoRef.current = now;
      await captureSnapshot(true);
    }, 15000);
    return () => clearInterval(i);
  }, [cam, session]);

  const captureSnapshot = async (auto = false) => {
    if (!cam || !session) return;
    const at = new Date();
    const url = mockSnapshotUrl(cam.mock_seed, at);
    const path = `mock://${cam.id}/${at.getTime()}`;
    const { data, error } = await supabase.from("photos").insert({
      user_id: session.user.id,
      tank_id: cam.tank_id,
      camera_id: cam.id,
      auto_captured: auto,
      captured_at: at.toISOString(),
      storage_path: path,
      image_url: url,
      status: "pending",
      tags: auto ? ["auto", "camera"] : ["manual", "camera"],
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("cameras").update({ last_snapshot_at: at.toISOString() }).eq("id", cam.id);

    // Build comparison bundle (latest + 1m, 10m, 1h, yesterday) and analyze.
    const bundle = await buildBundle(cam.id);
    supabase.functions.invoke("analyze-photo", {
      body: { photoId: data.id, comparisonPhotoIds: bundle },
    }).catch(console.error);

    if (!auto) toast.success("Snapshot captured · analyzing");
    loadSnaps();
  };

  const buildBundle = async (cameraId: string): Promise<string[]> => {
    const targets = [1, 10, 60, 24 * 60, 7 * 24 * 60]; // minutes ago
    const now = Date.now();
    const ids: string[] = [];
    for (const m of targets) {
      const target = new Date(now - m * 60 * 1000).toISOString();
      const { data } = await supabase.from("photos")
        .select("id,captured_at")
        .eq("camera_id", cameraId)
        .lte("captured_at", target)
        .order("captured_at", { ascending: false })
        .limit(1);
      if (data?.[0]) ids.push(data[0].id);
    }
    return [...new Set(ids)];
  };

  const updateSchedule = async (patch: Partial<Camera>) => {
    if (!cam) return;
    const { error } = await supabase.from("cameras").update(patch).eq("id", cam.id);
    if (error) return toast.error(error.message);
    setCam({ ...cam, ...patch });
    toast.success("Schedule updated");
  };

  if (loading || !session || !cam) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => nav({ to: "/cameras" })} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1.5 text-[11px]">
            {cam.status === "online" ? <><Wifi className="h-3 w-3 text-success" /> Online</> : <><WifiOff className="h-3 w-3 text-destructive" /> Offline</>}
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">{cam.name}</h1>
        <p className="text-xs text-muted-foreground capitalize">{cam.brand} · every {cam.snapshot_interval_minutes} min</p>

        {/* Tabs */}
        <div className="mt-5 glass rounded-2xl p-1 grid grid-cols-3 text-xs font-medium">
          {(["live", "schedule", "timeline"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2 rounded-xl capitalize transition ${tab === t ? "gradient-reef text-primary-foreground" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "live" && (
          <>
            <div className="mt-4 relative aspect-[16/10] rounded-3xl overflow-hidden">
              <img key={tick} src={mockLiveUrl(cam.mock_seed)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute top-3 left-3 glass-strong rounded-full px-2.5 py-1 text-[10px] flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" /> LIVE
              </div>
            </div>
            <button onClick={() => captureSnapshot(false)}
              className="mt-4 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2">
              <CameraIcon className="h-4 w-4" /> Capture snapshot
            </button>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link to="/timeline" className="glass rounded-2xl py-3 text-center text-sm font-medium flex items-center justify-center gap-2">
                <History className="h-4 w-4" /> Tank timeline
              </Link>
              <button onClick={() => setTab("schedule")} className="glass rounded-2xl py-3 text-sm font-medium flex items-center justify-center gap-2">
                <Settings2 className="h-4 w-4" /> Schedule
              </button>
            </div>
          </>
        )}

        {tab === "schedule" && (
          <div className="mt-5 space-y-4">
            <div className="glass rounded-3xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Snapshot frequency</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => updateSchedule({ snapshot_interval_minutes: opt.value })}
                    className={`text-xs py-2.5 rounded-xl border transition ${cam.snapshot_interval_minutes === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass rounded-3xl p-4">
              <p className="text-sm font-semibold mb-3">Active window</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground">Start</label>
                  <input type="time" value={cam.active_window_start ?? ""} onChange={(e) => updateSchedule({ active_window_start: e.target.value || null })}
                    className="mt-1 w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">End</label>
                  <input type="time" value={cam.active_window_end ?? ""} onChange={(e) => updateSchedule({ active_window_end: e.target.value || null })}
                    className="mt-1 w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Leave empty for 24h capture.</p>
            </div>

            <div className="glass rounded-3xl p-4 flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Each scheduled snapshot is bundled with comparison frames from 1 min, 10 min, 1 hour, yesterday and last week before being sent to AI for whole-tank change detection.
              </p>
            </div>
          </div>
        )}

        {tab === "timeline" && (
          <div className="mt-5">
            {snaps.length === 0 ? (
              <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
                No snapshots yet. Capture one or wait for the schedule.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {snaps.map((s) => (
                  <Link key={s.id} to="/photo/$id" params={{ id: s.id }} className="relative aspect-square rounded-xl overflow-hidden">
                    <img src={s.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <p className="absolute bottom-1 left-1.5 right-1.5 text-[9px] text-white/90">
                      {s.captured_at ? new Date(s.captured_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
