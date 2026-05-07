import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/insights")({
  component: InsightsPage,
  head: () => ({ meta: [{ title: "Insights — Reef Tank AI" }] }),
});

function InsightsPage() {
  const { session } = useSession();
  const [counts, setCounts] = useState<{ diag: string; n: number }[]>([]);
  useEffect(() => {
    if (!session) return;
    supabase.from("photos").select("diagnosis").not("diagnosis", "is", null).then(({ data }) => {
      const map = new Map<string, number>();
      (data ?? []).forEach(r => map.set(r.diagnosis!, (map.get(r.diagnosis!) ?? 0) + 1));
      setCounts(Array.from(map, ([diag, n]) => ({ diag, n })).sort((a,b) => b.n - a.n));
    });
  }, [session]);

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Patterns across your tanks.</p>

        <div className="mt-6 glass rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Most common findings</h3>
          </div>
          {counts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Once you analyze a few photos, your most-spotted issues will show here.</p>
          ) : (
            <div className="space-y-3">
              {counts.slice(0, 8).map(c => {
                const max = counts[0].n;
                return (
                  <div key={c.diag}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{c.diag}</span><span className="text-muted-foreground">{c.n}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full gradient-reef" style={{ width: `${(c.n / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
