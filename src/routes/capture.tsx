import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, Image as ImageIcon, Loader2, Check, RotateCcw, Sparkles } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/capture")({
  component: CapturePage,
  head: () => ({ meta: [{ title: "Capture — Reef Tank AI" }] }),
});

type Step = "select" | "preview" | "details" | "uploading";
type Quality = { sharpness: "Good" | "Poor"; lighting: "Good" | "Poor"; coverage: "Good" | "Poor"; stability: "Good" | "Poor" };
type Tank = { id: string; name: string };
type Coral = { id: string; name: string };

function CapturePage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [tankId, setTankId] = useState<string | "">("");
  const [corals, setCorals] = useState<Coral[]>([]);
  const [coralId, setCoralId] = useState<string | "">("");
  const [capturedAt, setCapturedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  useEffect(() => {
    if (!session) return;
    supabase.from("tanks").select("id,name").order("created_at", { ascending: false }).then(({ data }) => {
      setTanks(data ?? []);
      if (data?.[0]) setTankId(data[0].id);
    });
    supabase.from("corals").select("id,name").order("created_at", { ascending: false }).then(({ data }) => {
      setCorals(data ?? []);
    });
  }, [session]);

  const onPick = async (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    setStep("preview");
    // Image quality heuristic
    const q = await checkQuality(f);
    setQuality(q);
  };

  const upload = async () => {
    if (!file || !session) return;
    setStep("uploading");
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tank-photos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("tank-photos").getPublicUrl(path);

      const { data: photo, error } = await supabase.from("photos").insert({
        user_id: session.user.id,
        tank_id: tankId || null,
        coral_id: coralId || null,
        captured_at: capturedAt ? new Date(capturedAt).toISOString() : new Date().toISOString(),
        storage_path: path,
        image_url: pub.publicUrl,
        notes: notes || null,
        tags,
        quality_sharpness: quality?.sharpness, quality_lighting: quality?.lighting,
        quality_coverage: quality?.coverage, quality_stability: quality?.stability,
        status: "pending",
      }).select().single();
      if (error) throw error;

      // Kick off analysis (don't await long)
      supabase.functions.invoke("analyze-photo", { body: { photoId: photo.id } }).catch(console.error);

      toast.success("Image saved. Analyzing…");
      nav({ to: "/photo/$id", params: { id: photo.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setStep("details");
    }
  };

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <button onClick={() => (step === "select" ? nav({ to: "/" }) : setStep(step === "details" ? "preview" : "select"))} className="h-10 w-10 rounded-2xl glass flex items-center justify-center mb-4">
          <ArrowLeft className="h-4 w-4" />
        </button>

        <AnimatePresence mode="wait">
          {step === "select" && (
            <motion.div key="select" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h1 className="text-3xl font-bold tracking-tight">Capture <span className="text-gradient-reef">your tank</span></h1>
              <p className="text-sm text-muted-foreground mt-1">Frame the area you want analyzed.</p>

              <div className="mt-8 aspect-[4/5] rounded-3xl glass overflow-hidden relative flex items-center justify-center">
                <div className="absolute inset-6 border-2 border-dashed border-primary/40 rounded-2xl" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
                <Camera className="h-10 w-10 text-primary/60" />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()} className="gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2">
                  <Camera className="h-4 w-4" /> Take Photo
                </button>
                <button onClick={() => galleryRef.current?.click()} className="glass rounded-2xl py-4 font-semibold flex items-center justify-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Gallery
                </button>
              </div>

              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
              <input ref={galleryRef} type="file" accept="image/*" hidden
                onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
            </motion.div>
          )}

          {step === "preview" && quality && (
            <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold tracking-tight">Quality check</h1>
              <div className="mt-4 aspect-[4/5] rounded-3xl overflow-hidden relative">
                <img src={preview} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent" />
              </div>
              <div className="mt-4 glass rounded-3xl p-4 space-y-2">
                {(["sharpness","lighting","coverage","stability"] as const).map(k => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <span className={`font-medium ${quality[k] === "Good" ? "text-success" : "text-warning"}`}>{quality[k]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button onClick={() => { setStep("select"); setFile(null); }} className="glass rounded-2xl py-3 font-semibold flex items-center justify-center gap-2">
                  <RotateCcw className="h-4 w-4" /> Retake
                </button>
                <button onClick={() => setStep("details")} className="gradient-reef rounded-2xl py-3 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2">
                  <Check className="h-4 w-4" /> Continue
                </button>
              </div>
            </motion.div>
          )}

          {step === "details" && (
            <motion.div key="details" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold tracking-tight">Add context <span className="text-muted-foreground text-base font-normal">(optional)</span></h1>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">Tank</label>
                  <select value={tankId} onChange={(e) => setTankId(e.target.value)} className="mt-1 w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm">
                    <option value="">— None —</option>
                    {tanks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Tags</label>
                  <div className="mt-1 glass rounded-2xl p-2 flex flex-wrap gap-2 min-h-12">
                    {tags.map(t => (
                      <span key={t} onClick={() => setTags(tags.filter(x => x !== t))} className="text-xs bg-primary/20 text-primary px-2.5 py-1 rounded-full cursor-pointer">
                        {t} ×
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagInput.trim()) {
                          setTags([...tags, tagInput.trim()]);
                          setTagInput(""); e.preventDefault();
                        }
                      }}
                      placeholder="Clownfish, Torch coral…"
                      className="flex-1 bg-transparent text-sm outline-none min-w-32"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    placeholder="e.g. white spots on clown's fins"
                    className="mt-1 w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm resize-none" />
                </div>
              </div>

              <button onClick={upload} className="mt-6 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4" /> Save & Analyze
              </button>
            </motion.div>
          )}

          {step === "uploading" && (
            <motion.div key="up" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Uploading…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MobileShell>
  );
}

async function checkQuality(file: File): Promise<Quality> {
  // Lightweight client-side checks: brightness via canvas, dimensions for coverage.
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = (canvas.width = 64);
      const h = (canvas.height = 64);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let sum = 0, varSum = 0;
      const lum: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        lum.push(l); sum += l;
      }
      const mean = sum / lum.length;
      for (const l of lum) varSum += (l - mean) ** 2;
      const variance = varSum / lum.length;
      resolve({
        sharpness: variance > 400 ? "Good" : "Poor",
        lighting: mean > 50 && mean < 220 ? "Good" : "Poor",
        coverage: img.width >= 600 && img.height >= 600 ? "Good" : "Poor",
        stability: "Good",
      });
    };
    img.src = URL.createObjectURL(file);
  });
}
