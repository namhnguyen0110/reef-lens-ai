import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, X, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/timeline")({
  component: TimelinePage,
  head: () => ({ meta: [{ title: "Timeline — Reef Tank AI" }] }),
});

type Photo = {
  id: string; image_url: string; storage_path: string | null; diagnosis: string | null; severity: string | null;
  status: string; created_at: string; tags: string[] | null;
};

type Filter = "all" | "problems" | "healthy";

function TimelinePage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  const reload = () => {
    supabase.from("photos").select("id,image_url,storage_path,diagnosis,severity,status,created_at,tags")
      .order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setPhotos((data ?? []) as Photo[]));
  };
  useEffect(() => { if (session) reload(); }, [session]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} photo${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const paths = photos
        .filter(p => ids.includes(p.id) && p.storage_path && !p.storage_path.startsWith("mock://"))
        .map(p => p.storage_path!);
      if (paths.length) await supabase.storage.from("tank-photos").remove(paths);
      const { error } = await supabase.from("photos").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${ids.length} photo${ids.length > 1 ? "s" : ""}`);
      exitSelect();
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    photos.forEach(p => (p.tags ?? []).forEach(t => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [photos]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return photos.filter(p => {
      if (filter === "problems" && (!p.diagnosis || p.diagnosis === "Healthy")) return false;
      if (filter === "healthy" && p.diagnosis !== "Healthy") return false;
      if (activeTags.length && !activeTags.every(t => p.tags?.includes(t))) return false;
      if (ql) {
        const hay = `${p.diagnosis ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [photos, q, filter, activeTags]);

  const groups = groupByPeriod(filtered);

  const toggleTag = (t: string) =>
    setActiveTags(activeTags.includes(t) ? activeTags.filter(x => x !== t) : [...activeTags, t]);

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Your reef, day by day.</p>

        {/* Search */}
        <div className="mt-5 glass rounded-2xl px-4 py-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search torch coral, ich, dinos…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {q && <button onClick={() => setQ("")}><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>

        {/* Status filter */}
        <div className="mt-3 flex gap-2">
          {(["all", "problems", "healthy"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize transition ${
                filter === f ? "gradient-reef text-primary-foreground" : "glass text-muted-foreground"
              }`}
            >{f}</button>
          ))}
        </div>

        {/* Tag chips */}
        {allTags.length > 0 && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {allTags.map(t => {
              const on = activeTags.includes(t);
              return (
                <button key={t} onClick={() => toggleTag(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition ${on ? "bg-accent/30 text-accent" : "bg-primary/10 text-primary/80"}`}>
                  {t}
                </button>
              );
            })}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-8 glass rounded-3xl p-8 text-center">
            <Filter className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No photos match your filters.</p>
          </div>
        )}

        <div className="mt-6 space-y-7">
          {groups.map(g => (
            <div key={g.label}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{g.label}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map(p => (
                  <Link key={p.id} to="/photo/$id" params={{ id: p.id }} className="relative aspect-square rounded-2xl overflow-hidden">
                    <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                    {p.severity && p.severity !== "None" && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
                    )}
                    <div className="absolute bottom-1 left-1.5 right-1.5">
                      <p className="text-[10px] font-medium text-white line-clamp-1">{p.diagnosis ?? p.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}

function groupByPeriod(photos: Photo[]) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now).getTime();
  const weekStart = today - 6 * 86400000;
  const lastWeekStart = today - 13 * 86400000;
  const monthStart = today - 30 * 86400000;

  const buckets: Record<string, Photo[]> = { "This week": [], "Last week": [], "This month": [], "Older": [] };
  for (const p of photos) {
    const t = new Date(p.created_at).getTime();
    if (t >= weekStart) buckets["This week"].push(p);
    else if (t >= lastWeekStart) buckets["Last week"].push(p);
    else if (t >= monthStart) buckets["This month"].push(p);
    else buckets["Older"].push(p);
  }
  return Object.entries(buckets).filter(([, v]) => v.length).map(([label, items]) => ({ label, items }));
}
