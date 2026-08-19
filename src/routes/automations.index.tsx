import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Workflow, ChevronRight, Play, Power, Wand2, Loader2 } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import { seedDemoSetup } from "@/lib/demo-seed";

export const Route = createFileRoute("/automations/")({
  component: AutomationsPage,
  head: () => ({
    meta: [
      { title: "Automations — Reef Tank AI" },
      { name: "description", content: "Build camera automations: move to a PTZ preset, capture, file into an area folder and let AI compare over time." },
      { property: "og:title", content: "Automations — Reef Tank AI" },
      { property: "og:description", content: "Scheduled PTZ preset tours and AI comparisons for your reef tank camera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Wf = {
  id: string; name: string; trigger_type: string; trigger_time: string | null;
  interval_minutes: number | null; enabled: boolean; last_run_at: string | null; steps?: number;
};

export function triggerLabel(w: Pick<Wf, "trigger_type" | "trigger_time" | "interval_minutes">) {
  if (w.trigger_type === "daily") return `Daily at ${w.trigger_time?.slice(0, 5) ?? "—"}`;
  if (w.trigger_type === "interval") return `Every ${w.interval_minutes ?? 60} min`;
  return "Manual only";
}

function AutomationsPage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [items, setItems] = useState<Wf[]>([]);
  const [seeding, setSeeding] = useState(false);

  const seedDemo = async () => {
    if (!session) return;
    setSeeding(true);
    try {
      const res = await seedDemoSetup(session.user.id);
      toast.success(`Demo ready — ${res.presets} presets, ${res.areas} area folders, ${res.seededPhotos} sample photos`);
      await load();
      if (res.workflowId) nav({ to: "/automations/$id", params: { id: res.workflowId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create demo data");
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const { data } = await supabase
      .from("workflows")
      .select("id,name,trigger_type,trigger_time,interval_minutes,enabled,last_run_at")
      .order("created_at", { ascending: true });
    const list = (data as Wf[]) ?? [];
    const enriched = await Promise.all(
      list.map(async (w) => {
        const { count } = await supabase.from("workflow_steps").select("id", { count: "exact", head: true }).eq("workflow_id", w.id);
        return { ...w, steps: count ?? 0 };
      }),
    );
    setItems(enriched);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const create = async () => {
    if (!session) return;
    const { data: cam } = await supabase.from("cameras").select("id").limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("workflows")
      .insert({ user_id: session.user.id, name: "New automation", camera_id: cam?.id ?? null, trigger_type: "manual" })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    nav({ to: "/automations/$id", params: { id: data.id } });
  };

  const toggle = async (w: Wf) => {
    await supabase.from("workflows").update({ enabled: !w.enabled }).eq("id", w.id);
    setItems((prev) => prev.map((p) => (p.id === w.id ? { ...p, enabled: !p.enabled } : p)));
  };

  const runNow = async (w: Wf) => {
    if (!session) return;
    const { error } = await supabase.from("workflow_runs").insert({
      user_id: session.user.id, workflow_id: w.id, scheduled_for: new Date().toISOString(), status: "queued",
    });
    if (error) return toast.error(error.message);
    toast.success("Queued — the bridge will pick it up shortly");
  };

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
            <p className="text-sm text-muted-foreground mt-1">Preset tours, captures and AI comparisons</p>
          </div>
          <button onClick={create} className="gradient-reef rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-primary-foreground flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        <button onClick={seedDemo} disabled={seeding}
          className="mt-4 w-full glass rounded-2xl py-3.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-primary" />}
          Create demo presets, areas & sample workflow
        </button>

        <div className="mt-5 space-y-3">
          {items.length === 0 && (
            <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
              No automations yet. Create one and drag steps into order.
            </div>
          )}
          {items.map((w) => (
            <div key={w.id} className="glass rounded-3xl p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl gradient-reef flex items-center justify-center text-primary-foreground shrink-0">
                  <Workflow className="h-4 w-4" />
                </div>
                <Link to="/automations/$id" params={{ id: w.id }} className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{w.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {triggerLabel(w)} · {w.steps} step{w.steps === 1 ? "" : "s"}
                    {w.last_run_at ? ` · last ${new Date(w.last_run_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </p>
                </Link>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={() => runNow(w)} className="rounded-xl border border-border py-2 text-xs flex items-center justify-center gap-1.5">
                  <Play className="h-3.5 w-3.5" /> Run now
                </button>
                <button onClick={() => toggle(w)} className={`rounded-xl border py-2 text-xs flex items-center justify-center gap-1.5 ${w.enabled ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                  <Power className="h-3.5 w-3.5" /> {w.enabled ? "Enabled" : "Paused"}
                </button>
                <Link to="/automations/$id/runs" params={{ id: w.id }} className="rounded-xl border border-border py-2 text-xs flex items-center justify-center">
                  History
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
