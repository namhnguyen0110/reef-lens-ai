import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Clock, Sparkles } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { STEP_META, type StepType } from "@/lib/workflow-steps";

export const Route = createFileRoute("/automations/$id/runs")({
  component: RunHistory,
  head: () => ({
    meta: [
      { title: "Run history — Reef Tank AI" },
      { name: "description", content: "Every automation run with per-step status, captured frames and AI comparison results." },
      { property: "og:title", content: "Run history — Reef Tank AI" },
      { property: "og:description", content: "See exactly what your reef tank camera automation did on each run." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Run = { id: string; status: string; scheduled_for: string; started_at: string | null; finished_at: string | null; error: string | null };
type RunStep = { id: string; run_id: string; position: number; type: string; status: string; detail: string | null; photo_ids: string[] | null; comparison_id: string | null };

function statusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

function RunHistory() {
  const { id } = useParams({ from: "/automations/$id/runs" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [stepsByRun, setStepsByRun] = useState<Record<string, RunStep[]>>({});
  const [name, setName] = useState("");

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const { data: wf } = await supabase.from("workflows").select("name").eq("id", id).maybeSingle();
    setName(wf?.name ?? "Automation");
    const { data: r } = await supabase
      .from("workflow_runs")
      .select("id,status,scheduled_for,started_at,finished_at,error")
      .eq("workflow_id", id)
      .order("scheduled_for", { ascending: false })
      .limit(25);
    const list = (r as Run[]) ?? [];
    setRuns(list);
    if (list.length) {
      const { data: s } = await supabase
        .from("workflow_run_steps")
        .select("id,run_id,position,type,status,detail,photo_ids,comparison_id")
        .in("run_id", list.map((x) => x.id))
        .order("position");
      const grouped: Record<string, RunStep[]> = {};
      for (const st of ((s as RunStep[]) ?? [])) (grouped[st.run_id] ||= []).push(st);
      setStepsByRun(grouped);
    } else {
      setStepsByRun({});
    }
  };

  useEffect(() => { if (session) load(); }, [session, id]);
  useEffect(() => {
    if (!session) return;
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [session, id]);

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <Link to="/automations/$id" params={{ id }} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Run history</h1>
            <p className="text-xs text-muted-foreground">{name}</p>
          </div>
        </div>

        {runs.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            No runs yet. Hit “Run now” or wait for the schedule — the bridge must be online.
          </div>
        )}

        <div className="space-y-3">
          {runs.map((r) => (
            <div key={r.id} className="glass rounded-3xl p-4">
              <div className="flex items-center gap-2">
                {statusIcon(r.status)}
                <p className="text-sm font-semibold capitalize">{r.status}</p>
                <p className="ml-auto text-[11px] text-muted-foreground">
                  {new Date(r.scheduled_for).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {r.error && <p className="mt-2 text-[11px] text-destructive">{r.error}</p>}
              <div className="mt-3 space-y-2">
                {(stepsByRun[r.id] ?? []).map((s) => (
                  <div key={s.id} className="flex items-start gap-2">
                    <div className="mt-0.5">{statusIcon(s.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{STEP_META[s.type as StepType]?.label ?? s.type}</p>
                      {s.detail && <p className="text-[11px] text-muted-foreground">{s.detail}</p>}
                      {!!s.photo_ids?.length && (
                        <div className="mt-1.5 flex gap-1.5 flex-wrap">
                          {s.photo_ids.slice(0, 6).map((pid) => (
                            <Link key={pid} to="/photo/$id" params={{ id: pid }} className="text-[10px] rounded-full bg-primary/15 text-primary px-2 py-0.5">
                              photo
                            </Link>
                          ))}
                        </div>
                      )}
                      {s.comparison_id && (
                        <p className="mt-1 text-[10px] text-primary flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> AI comparison saved
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {(stepsByRun[r.id] ?? []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Waiting for the bridge to claim this run…</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
