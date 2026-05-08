import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, GitCompare, Loader2, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/compare/$id")({
  component: ComparePage,
  head: () => ({ meta: [{ title: "Compare — Reef Tank AI" }] }),
});

type Photo = { id: string; image_url: string; diagnosis: string | null; created_at: string };
type Comparison = {
  summary: string;
  trend: "Improving" | "Stable" | "Worsening" | "Mixed";
  changes: string[];
  recommendations: string[];
};

function ComparePage() {
  const { id } = useParams({ from: "/compare/$id" });
  const { session, loading } = useSession();
  const nav = useNavigate();

  const [current, setCurrent] = useState<Photo | null>(null);
  const [candidates, setCandidates] = useState<Photo[]>([]);
  const [otherId, setOtherId] = useState<string>("");
  const [result, setResult] = useState<Comparison | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; summary: string; trend: Comparison["trend"]; changes: string[]; recommendations: string[]; created_at: string; photo_older_id: string; photo_newer_id: string }>>([]);

  const loadHistory = async () => {
    const { data } = await supabase.from("comparisons")
      .select("id,summary,trend,changes,recommendations,created_at,photo_older_id,photo_newer_id")
      .or(`photo_older_id.eq.${id},photo_newer_id.eq.${id}`)
      .order("created_at", { ascending: false });
    setHistory((data ?? []) as any);
  };

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: cur } = await supabase.from("photos").select("id,image_url,diagnosis,created_at").eq("id", id).single();
      setCurrent(cur);
      const { data: list } = await supabase.from("photos")
        .select("id,image_url,diagnosis,created_at")
        .neq("id", id)
        .order("created_at", { ascending: false }).limit(40);
      setCandidates(list ?? []);
      if (list?.[0]) setOtherId(list[0].id);
      loadHistory();
    })();
  }, [id, session]);

  const other = useMemo(() => candidates.find(c => c.id === otherId) ?? null, [candidates, otherId]);

  // Older vs newer
  const [older, newer] = useMemo(() => {
    if (!current || !other) return [null, null] as const;
    return new Date(current.created_at).getTime() < new Date(other.created_at).getTime()
      ? [current, other] : [other, current];
  }, [current, other]);

  const runCompare = async () => {
    if (!older || !newer) return;
    setAnalyzing(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("compare-photos", {
        body: { photoIdA: older.id, photoIdB: newer.id },
      });
      if (error) throw error;
      setResult(data.result);
      // Persist to history
      if (session?.user) {
        await supabase.from("comparisons").insert({
          user_id: session.user.id,
          photo_older_id: older.id,
          photo_newer_id: newer.id,
          summary: data.result.summary,
          trend: data.result.trend,
          changes: data.result.changes ?? [],
          recommendations: data.result.recommendations ?? [],
          raw: data.result,
        });
        loadHistory();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Compare failed");
    } finally { setAnalyzing(false); }
  };

  if (!current) return <MobileShell><div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div></MobileShell>;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between mb-5">
          <Link to="/photo/$id" params={{ id }} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-bold">Compare</h1>
          <div className="w-10" />
        </div>

        {/* Side-by-side slider */}
        {older && newer && <BeforeAfter older={older} newer={newer} />}

        {/* Picker */}
        <div className="mt-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Compare against</p>
          {candidates.length === 0 ? (
            <div className="glass rounded-3xl p-5 text-sm text-muted-foreground">No other photos yet.</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
              {candidates.map(c => (
                <button key={c.id} onClick={() => { setOtherId(c.id); setResult(null); }}
                  className={`relative h-20 w-20 flex-shrink-0 rounded-2xl overflow-hidden border-2 transition ${otherId === c.id ? "border-primary glow-aqua" : "border-transparent"}`}>
                  <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                  <span className="absolute bottom-0.5 left-1 right-1 text-[9px] text-white truncate">{new Date(c.created_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={runCompare} disabled={!other || analyzing}
          className="mt-5 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2 disabled:opacity-50">
          {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing changes…</> : <><Sparkles className="h-4 w-4" /> Analyze changes</>}
        </button>

        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-4">
            <div className="glass-strong rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendIcon trend={result.trend} />
                <span className="font-semibold">{result.trend}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
            </div>

            <div className="glass rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <GitCompare className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">What changed</h3>
              </div>
              <ul className="space-y-1.5">
                {result.changes.map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span>{c}</li>
                ))}
              </ul>
            </div>

            {result.recommendations.length > 0 && (
              <div className="glass rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <h3 className="font-semibold">Recommendations</h3>
                </div>
                <ul className="space-y-1.5">
                  {result.recommendations.map((c, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-accent">•</span>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {history.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Past comparisons ({history.length})</p>
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendIcon trend={h.trend} />
                      <span className="text-sm font-semibold">{h.trend}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                      <button
                        onClick={async () => {
                          if (!confirm("Delete this comparison?")) return;
                          await supabase.from("comparisons").delete().eq("id", h.id);
                          loadHistory();
                        }}
                        className="text-[10px] text-destructive"
                      >Delete</button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{h.summary}</p>
                  {h.changes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {h.changes.map((c, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2"><span className="text-primary">•</span>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function TrendIcon({ trend }: { trend: Comparison["trend"] }) {
  if (trend === "Improving") return <TrendingUp className="h-5 w-5 text-success" />;
  if (trend === "Worsening") return <TrendingDown className="h-5 w-5 text-destructive" />;
  if (trend === "Mixed") return <GitCompare className="h-5 w-5 text-warning" />;
  return <Minus className="h-5 w-5 text-muted-foreground" />;
}

function BeforeAfter({ older, newer }: { older: Photo; newer: Photo }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (clientX: number) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div ref={ref}
      onMouseMove={(e) => e.buttons === 1 && onMove(e.clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onClick={(e) => onMove(e.clientX)}
      className="relative aspect-[4/5] rounded-3xl overflow-hidden glass select-none touch-none"
    >
      <img src={newer.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img src={older.image_url} alt="" className="h-full w-full object-cover"
          style={{ width: ref.current?.getBoundingClientRect().width ?? "100%", maxWidth: "none" }} />
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-white/90 shadow-lg" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-9 w-9 rounded-full bg-white shadow-lg flex items-center justify-center">
          <GitCompare className="h-4 w-4 text-foreground" />
        </div>
      </div>
      <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wider bg-black/50 text-white rounded-full px-2 py-1">Before · {new Date(older.created_at).toLocaleDateString()}</span>
      <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider bg-black/50 text-white rounded-full px-2 py-1">After · {new Date(newer.created_at).toLocaleDateString()}</span>
    </div>
  );
}
