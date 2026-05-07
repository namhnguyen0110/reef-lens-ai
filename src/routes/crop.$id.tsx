import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Sparkles, Check, Trash2, Plus, Scissors } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/crop/$id")({
  component: CropPage,
  head: () => ({ meta: [{ title: "Auto-crop corals — Reef Tank AI" }] }),
});

type Box = { x: number; y: number; w: number; h: number };
type Candidate = {
  id: string;
  label: string;
  species?: string;
  confidence: number;
  tags: string[];
  box: Box;
  coralId: string | "" | "__new__";
  newName: string;
  saved?: boolean;
};
type Coral = { id: string; name: string };
type Photo = { id: string; image_url: string; storage_path: string; tank_id: string | null; captured_at: string | null; user_id: string };

function CropPage() {
  const { id } = useParams({ from: "/crop/$id" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [corals, setCorals] = useState<Coral[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    supabase.from("photos").select("id,image_url,storage_path,tank_id,captured_at,user_id").eq("id", id).single()
      .then(({ data }) => setPhoto(data as Photo | null));
    supabase.from("corals").select("id,name").order("created_at", { ascending: false })
      .then(({ data }) => setCorals(data ?? []));
  }, [id, session]);

  const detect = async () => {
    if (!photo) return;
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("detect-corals", { body: { photoId: photo.id } });
      if (error) throw error;
      const list = (data?.corals ?? []) as Omit<Candidate, "id" | "coralId" | "newName">[];
      if (list.length === 0) toast.message("No corals detected", { description: "Try a clearer or closer photo." });
      setCandidates(list.map((c, i) => ({
        ...c,
        id: `${Date.now()}-${i}`,
        coralId: "",
        newName: c.label,
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  const removeCandidate = (cid: string) => setCandidates(prev => prev.filter(c => c.id !== cid));
  const updateCandidate = (cid: string, patch: Partial<Candidate>) =>
    setCandidates(prev => prev.map(c => c.id === cid ? { ...c, ...patch } : c));

  const saveOne = async (c: Candidate): Promise<boolean> => {
    if (!photo || !session) return false;
    try {
      // Resolve coral folder
      let coralId: string | null = c.coralId === "__new__"
        ? null
        : (c.coralId || null);
      if (c.coralId === "__new__") {
        const name = c.newName.trim() || c.label;
        const { data: created, error: cErr } = await supabase
          .from("corals")
          .insert({ name, species: c.species || null, user_id: session.user.id })
          .select().single();
        if (cErr) throw cErr;
        coralId = created.id;
        setCorals(prev => [{ id: created.id, name }, ...prev]);
      }

      // Render the crop client-side via canvas and upload
      const blob = await cropToBlob(photo.image_url, c.box);
      const path = `${session.user.id}/crops/${photo.id}-${c.id}.jpg`;
      const { error: upErr } = await supabase.storage.from("tank-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("tank-photos").getPublicUrl(path);

      const { data: cropPhoto, error: insErr } = await supabase.from("photos").insert({
        user_id: session.user.id,
        tank_id: photo.tank_id,
        coral_id: coralId,
        captured_at: photo.captured_at,
        storage_path: path,
        image_url: pub.publicUrl,
        source_photo_id: photo.id,
        crop_box: c.box,
        tags: c.tags ?? [],
        status: "pending",
      }).select().single();
      if (insErr) throw insErr;

      // Kick off analysis in background
      supabase.functions.invoke("analyze-photo", { body: { photoId: cropPhoto.id } }).catch(console.error);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
      return false;
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    let ok = 0;
    for (const c of candidates) {
      if (c.saved) continue;
      const success = await saveOne(c);
      if (success) {
        ok++;
        setCandidates(prev => prev.map(p => p.id === c.id ? { ...p, saved: true } : p));
      }
    }
    setSavingAll(false);
    if (ok > 0) {
      toast.success(`Saved ${ok} coral${ok === 1 ? "" : "s"}`);
      nav({ to: "/photo/$id", params: { id: photo!.id } });
    }
  };

  if (loading || !session) return null;
  if (!photo) return <MobileShell><div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></MobileShell>;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-8">
        <div className="flex items-center justify-between mb-4">
          <Link to="/photo/$id" params={{ id: photo.id }} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <p className="text-xs text-muted-foreground">Auto-crop</p>
          <div className="w-10" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Detect <span className="text-gradient-reef">corals</span></h1>
        <p className="text-sm text-muted-foreground mt-1">AI finds each coral, you label and save them to folders.</p>

        {/* Source image with overlays */}
        <div className="mt-5 relative rounded-3xl overflow-hidden glass">
          <img
            ref={imgRef}
            src={photo.image_url}
            alt=""
            className="w-full h-auto block"
            onLoad={(e) => {
              const el = e.currentTarget;
              setImgDims({ w: el.naturalWidth, h: el.naturalHeight });
            }}
          />
          {candidates.map((c, i) => (
            <div
              key={c.id}
              className={`absolute border-2 rounded-md transition ${c.saved ? "border-success/80" : "border-primary"} pointer-events-none`}
              style={{
                left: `${c.box.x * 100}%`,
                top: `${c.box.y * 100}%`,
                width: `${c.box.w * 100}%`,
                height: `${c.box.h * 100}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.0)",
              }}
            >
              <span className={`absolute -top-6 left-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${c.saved ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"}`}>
                #{i + 1} {c.label}
              </span>
            </div>
          ))}
        </div>

        {/* Detect / actions */}
        {candidates.length === 0 && (
          <button
            onClick={detect}
            disabled={detecting}
            className="mt-5 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {detecting ? "Detecting corals…" : "Detect corals with AI"}
          </button>
        )}

        {candidates.length > 0 && (
          <>
            <div className="mt-6 space-y-3">
              {candidates.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`glass rounded-3xl p-3 flex gap-3 ${c.saved ? "opacity-60" : ""}`}
                >
                  <CropThumb src={photo.image_url} box={c.box} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">#{i + 1} · {Math.round(c.confidence)}%</p>
                      <button
                        onClick={() => removeCandidate(c.id)}
                        disabled={c.saved}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <input
                      value={c.label}
                      onChange={(e) => updateCandidate(c.id, { label: e.target.value })}
                      disabled={c.saved}
                      className="mt-1 w-full bg-input border border-border rounded-xl px-2.5 py-1.5 text-sm font-medium"
                      placeholder="Coral name"
                    />

                    <select
                      value={c.coralId}
                      onChange={(e) => updateCandidate(c.id, { coralId: e.target.value as Candidate["coralId"] })}
                      disabled={c.saved}
                      className="mt-2 w-full bg-input border border-border rounded-xl px-2.5 py-1.5 text-xs"
                    >
                      <option value="">— Unassigned —</option>
                      {corals.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      <option value="__new__">+ Create new folder…</option>
                    </select>

                    {c.coralId === "__new__" && (
                      <input
                        value={c.newName}
                        onChange={(e) => updateCandidate(c.id, { newName: e.target.value })}
                        disabled={c.saved}
                        placeholder="New coral folder name"
                        className="mt-2 w-full bg-input border border-border rounded-xl px-2.5 py-1.5 text-xs"
                      />
                    )}

                    {c.tags && c.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.tags.slice(0, 4).map(t => (
                          <span key={t} className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={detect}
                disabled={detecting || savingAll}
                className="glass rounded-2xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" /> Re-detect
              </button>
              <button
                onClick={saveAll}
                disabled={savingAll || candidates.every(c => c.saved)}
                className="gradient-reef rounded-2xl py-3 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save {candidates.filter(c => !c.saved).length}
              </button>
            </div>
          </>
        )}
      </div>
    </MobileShell>
  );
}

function CropThumb({ src, box }: { src: string; box: Box }) {
  // Use background-image with sizing so the thumbnail shows just the cropped region.
  // backgroundSize is set so the full image fits; offset positioned to crop region.
  const sizePct = `${100 / box.w}% ${100 / box.h}%`;
  const posX = box.w >= 1 ? 0 : (box.x / (1 - box.w)) * 100;
  const posY = box.h >= 1 ? 0 : (box.y / (1 - box.h)) * 100;
  return (
    <div
      className="h-20 w-20 rounded-2xl shrink-0 bg-muted"
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: sizePct,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

async function cropToBlob(url: string, box: Box): Promise<Blob> {
  const img = await loadImage(url);
  const sx = Math.round(box.x * img.naturalWidth);
  const sy = Math.round(box.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(box.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(box.h * img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => b ? res(b) : rej(new Error("Canvas crop failed")), "image/jpeg", 0.9)
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}
