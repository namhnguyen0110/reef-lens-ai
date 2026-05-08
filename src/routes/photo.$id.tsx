import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, AlertTriangle, Activity, Pill, Eye, Clock, Sparkles, ListChecks, ArrowRight, GitCompare, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/photo/$id")({
  component: PhotoPage,
  head: () => ({ meta: [{ title: "Diagnosis — Reef Tank AI" }] }),
});

type Photo = {
  id: string; image_url: string; storage_path: string | null; status: string; diagnosis: string | null; confidence: number | null;
  severity: string | null; affected_area: string | null; explanation: string | null;
  likely_causes: string[] | null; next_step: string | null;
  alternatives: { name: string; confidence: number }[] | null;
  treatment_plan: { steps: string[]; medication?: string; dosage?: string; warnings?: string[]; recovery_timeline?: string; monitor: string[] } | null;
  tags: string[] | null; created_at: string;
};

function PhotoPage() {
  const { id } = useParams({ from: "/photo/$id" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [compareCount, setCompareCount] = useState(0);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("photos").select("*").eq("id", id).single();
      if (active) setPhoto(data as Photo | null);
      const { count } = await supabase.from("comparisons")
        .select("id", { count: "exact", head: true })
        .or(`photo_older_id.eq.${id},photo_newer_id.eq.${id}`);
      if (active) setCompareCount(count ?? 0);
    };
    load();
    const ch = supabase.channel(`photo-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "photos", filter: `id=eq.${id}` },
        (p) => setPhoto(p.new as Photo))
      .subscribe();
    const poll = setInterval(load, 5000);
    return () => { active = false; supabase.removeChannel(ch); clearInterval(poll); };
  }, [id, session]);

  if (!photo) return <MobileShell><div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></MobileShell>;

  const isPending = photo.status === "pending";
  const isAnalyzing = photo.status === "analyzing";
  const isError = photo.status === "error";
  const sevColor = photo.severity === "Severe" ? "text-destructive" : photo.severity === "Moderate" ? "text-warning" : photo.severity === "Mild" ? "text-accent" : "text-success";

  return (
    <MobileShell>
      <div className="relative">
        <div className="relative h-72 w-full overflow-hidden">
          <img src={photo.image_url} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background" />
          <Link to="/" className="absolute top-6 left-5 h-10 w-10 rounded-2xl glass-strong flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="absolute top-6 right-5 flex items-center gap-2">
            <div className="glass-strong rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {new Date(photo.created_at).toLocaleString()}
            </div>
            <button
              onClick={async () => {
                if (!confirm("Delete this photo? This cannot be undone.")) return;
                if (photo.storage_path) await supabase.storage.from("tank-photos").remove([photo.storage_path]);
                const { error } = await supabase.from("photos").delete().eq("id", photo.id);
                if (error) { toast.error(error.message); return; }
                toast.success("Photo deleted");
                nav({ to: "/timeline" });
              }}
              className="h-9 w-9 rounded-2xl glass-strong flex items-center justify-center text-destructive"
              aria-label="Delete photo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-8 -mt-10 relative">
          {isPending && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="glass-strong rounded-3xl p-6 flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
                <Sparkles className="h-10 w-10 text-primary relative" />
              </div>
              <p className="mt-3 font-semibold">Snapshot saved</p>
              <p className="text-xs text-muted-foreground mt-1">Analysis will only run when you choose it.</p>
              <button
                onClick={() => supabase.functions.invoke("analyze-photo", { body: { photoId: photo.id } })}
                className="mt-4 gradient-reef rounded-2xl px-4 py-2 text-sm font-semibold text-primary-foreground"
              >Analyze this image</button>
              <Link to="/compare/$id" params={{ id: photo.id }} className="mt-3 text-sm font-medium text-primary">
                Manual compare
              </Link>
            </motion.div>
          )}

          {isAnalyzing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="glass-strong rounded-3xl p-6 flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <Sparkles className="h-10 w-10 text-primary relative" />
              </div>
              <p className="mt-3 font-semibold">AI is analyzing your reef…</p>
              <p className="text-xs text-muted-foreground mt-1">Usually takes 10–20 seconds.</p>
              <button
                onClick={async () => {
                  await supabase.from("photos").update({ status: "pending" }).eq("id", photo.id);
                  toast.success("Analysis cancelled");
                }}
                className="mt-4 glass rounded-2xl px-4 py-2 text-xs font-medium text-muted-foreground"
              >Cancel & reset</button>
            </motion.div>
          )}

          {isError && (
            <div className="glass rounded-3xl p-5">
              <AlertTriangle className="h-5 w-5 text-destructive mb-2" />
              <p className="font-semibold">Analysis failed</p>
              <p className="text-sm text-muted-foreground mt-1">{photo.explanation}</p>
              <button
                onClick={() => supabase.functions.invoke("analyze-photo", { body: { photoId: photo.id } })}
                className="mt-3 gradient-reef rounded-2xl px-4 py-2 text-sm font-semibold text-primary-foreground"
              >Retry</button>
            </div>
          )}

          {photo.status === "done" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Diagnosis card */}
              <div className="glass-strong rounded-3xl p-6 relative overflow-hidden">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full gradient-reef opacity-20 blur-2xl" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Diagnosis</p>
                <h2 className="text-2xl font-bold mt-1">{photo.diagnosis}</h2>

                <div className="flex items-center gap-4 mt-4">
                  <ConfidenceRing value={photo.confidence ?? 0} />
                  <div>
                    <p className="text-xs text-muted-foreground">Severity</p>
                    <p className={`text-lg font-semibold ${sevColor}`}>{photo.severity ?? "—"}</p>
                    {photo.affected_area && <p className="text-xs text-muted-foreground mt-0.5">Area: {photo.affected_area}</p>}
                  </div>
                </div>

                {photo.tags && photo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {photo.tags.slice(0, 6).map(t => (
                      <span key={t} className="text-xs bg-primary/15 text-primary px-2.5 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Next step CTA */}
              {photo.next_step && (
                <div className="rounded-3xl p-5 gradient-reef glow-aqua relative overflow-hidden">
                  <p className="text-xs uppercase tracking-wider text-primary-foreground/80">Do this next</p>
                  <p className="mt-1 font-semibold text-primary-foreground leading-snug">{photo.next_step}</p>
                </div>
              )}

              {/* Explanation */}
              {photo.explanation && (
                <Section icon={<Activity className="h-4 w-4" />} title="What's going on">
                  <p className="text-sm leading-relaxed text-muted-foreground">{photo.explanation}</p>
                </Section>
              )}

              {/* Likely causes */}
              {photo.likely_causes && photo.likely_causes.length > 0 && (
                <Section icon={<ListChecks className="h-4 w-4" />} title="Likely causes">
                  <ul className="space-y-1.5">
                    {photo.likely_causes.map((c, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span>{c}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Auto-crop action */}
              <Link to="/crop/$id" params={{ id: photo.id }} className="glass rounded-3xl p-4 flex items-center justify-between active:scale-[0.99] transition">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-2xl bg-accent/15 text-accent flex items-center justify-center"><Scissors className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold">Auto-crop corals</p>
                    <p className="text-xs text-muted-foreground">Detect & label each coral</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              {/* Compare action */}
              <Link to="/compare/$id" params={{ id: photo.id }} className="glass rounded-3xl p-4 flex items-center justify-between active:scale-[0.99] transition">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-2xl bg-primary/15 text-primary flex items-center justify-center"><GitCompare className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold">Compare with earlier photo</p>
                    <p className="text-xs text-muted-foreground">See what changed</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              {/* Treatment */}
              {photo.treatment_plan && (
                <Section icon={<Pill className="h-4 w-4" />} title="Treatment plan" accent>
                  <ol className="space-y-2">
                    {photo.treatment_plan.steps.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="h-6 w-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <span className="text-muted-foreground leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ol>
                  {(photo.treatment_plan.medication || photo.treatment_plan.dosage) && (
                    <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3 text-xs">
                      {photo.treatment_plan.medication && <Info label="Medication" value={photo.treatment_plan.medication} />}
                      {photo.treatment_plan.dosage && <Info label="Dosage" value={photo.treatment_plan.dosage} />}
                      {photo.treatment_plan.recovery_timeline && <Info label="Recovery" value={photo.treatment_plan.recovery_timeline} />}
                    </div>
                  )}
                  {photo.treatment_plan.warnings && photo.treatment_plan.warnings.length > 0 && (
                    <div className="mt-4 rounded-2xl bg-destructive/10 border border-destructive/20 p-3">
                      <p className="text-xs font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Warnings</p>
                      <ul className="mt-1.5 space-y-1">
                        {photo.treatment_plan.warnings.map((w, i) => (
                          <li key={i} className="text-xs text-muted-foreground">• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Section>
              )}

              {/* What to monitor */}
              {photo.treatment_plan?.monitor && photo.treatment_plan.monitor.length > 0 && (
                <Section icon={<Eye className="h-4 w-4" />} title="What to watch">
                  <ul className="space-y-1.5">
                    {photo.treatment_plan.monitor.map((m, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span>{m}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Alternatives */}
              {photo.alternatives && photo.alternatives.length > 0 && (
                <Section icon={<Sparkles className="h-4 w-4" />} title="Alternative possibilities">
                  <ul className="space-y-2">
                    {photo.alternatives.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span>{i + 1}. {a.name}</span>
                        <span className="text-xs text-muted-foreground">{a.confidence}%</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}

function Section({ icon, title, accent, children }: { icon: React.ReactNode; title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-7 w-7 rounded-xl flex items-center justify-center ${accent ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}`}>{icon}</div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 28; const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative h-20 w-20">
      <svg viewBox="0 0 70 70" className="h-full w-full -rotate-90">
        <circle cx="35" cy="35" r={r} stroke="currentColor" className="text-muted" strokeWidth="6" fill="none" opacity="0.2" />
        <circle cx="35" cy="35" r={r} stroke="url(#g)" strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.16 195)" />
            <stop offset="100%" stopColor="oklch(0.75 0.18 50)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{Math.round(value)}%</span>
      </div>
    </div>
  );
}
