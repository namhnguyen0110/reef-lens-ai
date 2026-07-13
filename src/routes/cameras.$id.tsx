import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera as CameraIcon, Clock, Sparkles, Wifi, WifiOff, Settings2, History, Sparkle, Layers, Timer, X } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { mockLiveUrl, mockSnapshotUrl, MOCK_LIVE_VIDEO, INTERVAL_OPTIONS, isWithinWindow, dahuaSnapshotCandidates, dahuaCredsKey, intervalLabel, intervalMs } from "@/lib/mock-camera";
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
  const [, setTick] = useState(0);
  const [pendingPhotoId, setPendingPhotoId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [dahuaSourceIndex, setDahuaSourceIndex] = useState(0);
  const [dahuaLoadFailed, setDahuaLoadFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastAutoRef = useRef<number>(Date.now());
  const shareStreamRef = useRef<MediaStream | null>(null);
  const shareVideoRef = useRef<HTMLVideoElement | null>(null);
  const [screenShareActive, setScreenShareActive] = useState(false);

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
  useEffect(() => { setDahuaSourceIndex(0); setDahuaLoadFailed(false); }, [id]);

  // Live preview refresh tick
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(i);
  }, []);

  // Scheduler — captures only; user decides whether to analyze.
  useEffect(() => {
    if (!cam || !session) return;
    // Dahua auto capture requires an active screen-share stream.
    if (cam.brand === "dahua" && !screenShareActive) return;
    const tickMs = cam.snapshot_interval_minutes === 0 ? 3000 : 15000;
    const i = setInterval(async () => {
      const now = Date.now();
      if (now - lastAutoRef.current < intervalMs(cam.snapshot_interval_minutes)) return;
      if (!isWithinWindow(new Date(), cam.active_window_start, cam.active_window_end)) return;
      lastAutoRef.current = now;
      await captureSnapshot(true);
    }, tickMs);
    return () => clearInterval(i);
  }, [cam, session, screenShareActive]);

  // Stop screen share on unmount / tab change.
  useEffect(() => {
    return () => {
      shareStreamRef.current?.getTracks().forEach((t) => t.stop());
      shareStreamRef.current = null;
    };
  }, []);

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      shareStreamRef.current = stream;
      const v = document.createElement("video");
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      await v.play();
      shareVideoRef.current = v;
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        shareStreamRef.current = null;
        shareVideoRef.current = null;
        setScreenShareActive(false);
        toast.message("Screen share stopped");
      });
      setScreenShareActive(true);
      toast.success("Screen capture ready — pick this tab to share the live view.");
    } catch {
      toast.error("Screen share cancelled");
    }
  };

  const stopScreenShare = () => {
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current = null;
    shareVideoRef.current = null;
    setScreenShareActive(false);
  };

  const grabFromVideoEl = async (video: HTMLVideoElement | null): Promise<{ blob: Blob; dataUrl: string } | null> => {
    if (!video) return null;
    for (let i = 0; i < 25 && video.readyState < 2; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (video.readyState < 2 || !video.videoWidth) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
      if (!blob) return null;
      return { blob, dataUrl };
    } catch {
      return null;
    }
  };

  const grabFrameBlob = async (): Promise<{ blob: Blob; dataUrl: string } | null> => {
    // Prefer the shared screen (Dahua path) if active; otherwise the local video.
    if (shareVideoRef.current) {
      const shot = await grabFromVideoEl(shareVideoRef.current);
      if (shot) return shot;
    }
    return grabFromVideoEl(videoRef.current);
  };

  const captureSnapshot = async (auto = false): Promise<string | null> => {
    if (!cam || !session) return null;
    setCapturing(true);
    try {
      const at = new Date();
      const frame = await grabFrameBlob();
      let imageUrl: string;
      let storagePath: string;
      if (frame) {
        storagePath = `${session.user.id}/${cam.id}/${at.getTime()}.jpg`;
        const { error: upErr } = await supabase.storage.from("tank-photos").upload(storagePath, frame.blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("tank-photos").getPublicUrl(storagePath);
        imageUrl = pub.publicUrl;
      } else {
        // Fallback if video frame isn't ready — use absolute URL so the AI can fetch it.
        const rel = mockSnapshotUrl(cam.mock_seed, at);
        imageUrl = rel.startsWith("http") ? rel : `${window.location.origin}${rel}`;
        storagePath = `mock://${cam.id}/${at.getTime()}`;
      }
      const { data, error } = await supabase.from("photos").insert({
        user_id: session.user.id,
        tank_id: cam.tank_id,
        camera_id: cam.id,
        auto_captured: auto,
        captured_at: at.toISOString(),
        storage_path: storagePath,
        image_url: imageUrl,
        status: "pending",
        tags: auto ? ["auto", "camera"] : ["manual", "camera"],
      }).select().single();
      if (error) throw error;
      await supabase.from("cameras").update({ last_snapshot_at: at.toISOString() }).eq("id", cam.id);
      loadSnaps();
      if (!auto) {
        setPendingPhotoId(data.id);
        toast.success("Snapshot captured");
      }
      return data.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
      return null;
    } finally {
      setCapturing(false);
    }
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

  const analyzeSingle = async () => {
    if (!pendingPhotoId) return;
    supabase.functions.invoke("analyze-photo", { body: { photoId: pendingPhotoId } }).catch(console.error);
    toast.success("Analyzing image…");
    nav({ to: "/photo/$id", params: { id: pendingPhotoId } });
  };

  const analyzeWithBundle = async () => {
    if (!pendingPhotoId || !cam) return;
    const bundle = await buildBundle(cam.id);
    supabase.functions.invoke("analyze-photo", {
      body: { photoId: pendingPhotoId, comparisonPhotoIds: bundle },
    }).catch(console.error);
    toast.success("Comparing against 1m / 10m / 1h / 1d / 1w…");
    nav({ to: "/photo/$id", params: { id: pendingPhotoId } });
  };

  const manualCompare = () => {
    if (!pendingPhotoId) return;
    nav({ to: "/compare/$id", params: { id: pendingPhotoId } });
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

        {tab === "live" && (() => {
          const isDahua = cam.brand === "dahua";
          const creds = isDahua ? (() => {
            try { const raw = localStorage.getItem(dahuaCredsKey(cam.id)); return raw ? JSON.parse(raw) as { host: string; username: string; password: string } : null; } catch { return null; }
          })() : null;
          const dahuaCandidates = creds ? dahuaSnapshotCandidates(creds.host, creds.username, creds.password) : [];
          const dahuaBaseSrc = dahuaCandidates[Math.min(dahuaSourceIndex, Math.max(dahuaCandidates.length - 1, 0))] ?? null;
          const dahuaSrc = dahuaBaseSrc ? `${dahuaBaseSrc}&_=${Math.floor(Date.now() / 2000)}` : null;
          return (
          <>
            <div className="mt-4 relative aspect-[16/10] rounded-3xl overflow-hidden bg-black">
              {isDahua && dahuaSrc ? (
                <>
                  <img
                    key={dahuaSrc}
                    src={dahuaSrc}
                    alt="Dahua live"
                    className="absolute inset-0 h-full w-full object-cover"
                    onLoad={() => setDahuaLoadFailed(false)}
                    onError={() => {
                      if (dahuaSourceIndex < dahuaCandidates.length - 1) {
                        setDahuaSourceIndex((current) => current + 1);
                      } else {
                        setDahuaLoadFailed(true);
                      }
                    }}
                  />
                  {dahuaLoadFailed && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-xs text-white/80 px-6 text-center">
                      <span>The app saved the camera, but the browser still cannot load the LAN snapshot.</span>
                      <a href={dahuaCandidates[0]} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-4 py-2 text-white">
                        Open camera snapshot
                      </a>
                    </div>
                  )}
                </>
              ) : isDahua ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70 px-6 text-center">
                  Camera credentials missing on this device. Re-add the camera to restore access.
                </div>
              ) : (
                <video ref={videoRef} src={MOCK_LIVE_VIDEO} poster={mockLiveUrl(cam.mock_seed)}
                  autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute top-3 left-3 glass-strong rounded-full px-2.5 py-1 text-[10px] flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" /> LIVE
              </div>
            </div>
            {isDahua && (
              <div className="mt-3 glass rounded-2xl p-3 text-[11px] text-muted-foreground">
                LAN preview only. To save snapshots for AI analysis, switch to the tunnel option — browsers can't upload images from cross-origin LAN cameras.
              </div>
            )}
            <button onClick={() => captureSnapshot(false)} disabled={capturing || isDahua}
              className="mt-4 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2 disabled:opacity-40">
              <CameraIcon className="h-4 w-4" /> {isDahua ? "Capture unavailable in LAN mode" : capturing ? "Capturing…" : "Capture snapshot"}
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
          );
        })()}

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
                Scheduled snapshots are saved silently — open any from the timeline to analyze it on its own or compare against earlier frames.
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

      {pendingPhotoId && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setPendingPhotoId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md glass-strong rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">Snapshot saved · what next?</p>
              <button onClick={() => setPendingPhotoId(null)} className="h-8 w-8 rounded-full glass flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Choose how you want to inspect this frame. Nothing runs automatically.</p>
            <button onClick={analyzeSingle} className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-accent/40 transition">
              <div className="h-10 w-10 rounded-xl gradient-reef flex items-center justify-center text-primary-foreground"><Sparkle className="h-4 w-4" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Analyze this image</p>
                <p className="text-[11px] text-muted-foreground">Run AI diagnosis on just this snapshot.</p>
              </div>
            </button>
            <button onClick={manualCompare} className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-accent/40 transition">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary"><Layers className="h-4 w-4" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Manual compare</p>
                <p className="text-[11px] text-muted-foreground">Pick which earlier snapshots to compare against.</p>
              </div>
            </button>
            <button onClick={analyzeWithBundle} className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-accent/40 transition">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary"><Timer className="h-4 w-4" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Scheduled comparison</p>
                <p className="text-[11px] text-muted-foreground">Now vs 1m · 10m · 1h · 1d · 1w ago.</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
