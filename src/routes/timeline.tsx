import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/timeline")({
  component: TimelinePage,
  head: () => ({ meta: [{ title: "Timeline — Reef Tank AI" }] }),
});

type Photo = { id: string; image_url: string; diagnosis: string | null; severity: string | null; status: string; created_at: string };

function TimelinePage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [photos, setPhotos] = useState<Photo[]>([]);
  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  useEffect(() => {
    if (!session) return;
    supabase.from("photos").select("id,image_url,diagnosis,severity,status,created_at")
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setPhotos(data ?? []));
  }, [session]);

  const groups = groupByPeriod(photos);

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Your reef, day by day.</p>

        {photos.length === 0 && (
          <div className="mt-8 glass rounded-3xl p-8 text-center">
            <p className="text-sm text-muted-foreground">No photos yet.</p>
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
