import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, GripVertical, Trash2, Plus, Move, Camera, FolderOpen, Timer, Sparkles, Play, History, Power,
} from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import {
  defaultConfig, describeStep, OFFSET_OPTIONS, STEP_META, TRIGGER_TYPES,
  type StepConfig, type StepType, type WorkflowStep,
} from "@/lib/workflow-steps";

export const Route = createFileRoute("/automations/$id/")({
  component: WorkflowBuilder,
  head: () => ({
    meta: [
      { title: "Edit automation — Reef Tank AI" },
      { name: "description", content: "Drag and drop camera steps: preset, capture, save to area, wait and AI compare." },
      { property: "og:title", content: "Edit automation — Reef Tank AI" },
      { property: "og:description", content: "Sequence PTZ presets and captures into a scheduled reef tank routine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Workflow = {
  id: string; name: string; camera_id: string | null; trigger_type: string;
  trigger_time: string | null; interval_minutes: number | null; enabled: boolean;
};
type Preset = { id: string; name: string; preset_number: number; area_id: string | null };
type Area = { id: string; name: string };

const ICONS: Record<StepType, typeof Move> = {
  goto_preset: Move, capture: Camera, save_area: FolderOpen, wait: Timer, ai_compare: Sparkles,
};

function WorkflowBuilder() {
  const { id } = useParams({ from: "/automations/$id/" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [wf, setWf] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const { data: w } = await supabase.from("workflows").select("*").eq("id", id).maybeSingle();
    setWf(w as Workflow | null);
    const { data: s } = await supabase.from("workflow_steps").select("id,workflow_id,position,type,config").eq("workflow_id", id).order("position");
    setSteps(((s ?? []) as unknown as WorkflowStep[]));
    const { data: a } = await supabase.from("areas").select("id,name").order("name");
    setAreas((a as Area[]) ?? []);
    if (w?.camera_id) {
      const { data: p } = await supabase.from("camera_presets").select("id,name,preset_number,area_id").eq("camera_id", w.camera_id).order("preset_number");
      setPresets((p as Preset[]) ?? []);
    } else {
      const { data: p } = await supabase.from("camera_presets").select("id,name,preset_number,area_id").order("preset_number");
      setPresets((p as Preset[]) ?? []);
    }
  };

  useEffect(() => { if (session) load(); }, [session, id]);

  const ctx = useMemo(
    () => ({
      presets: Object.fromEntries(presets.map((p) => [p.id, `${p.name} (#${p.preset_number})`])),
      areas: Object.fromEntries(areas.map((a) => [a.id, a.name])),
    }),
    [presets, areas],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const patchWorkflow = async (patch: Partial<Workflow>) => {
    if (!wf) return;
    setWf({ ...wf, ...patch });
    const { error } = await supabase.from("workflows").update(patch).eq("id", wf.id);
    if (error) toast.error(error.message);
  };

  const addStep = async (type: StepType) => {
    if (!session) return;
    const position = steps.length;
    const config = defaultConfig(type);
    const { data, error } = await supabase
      .from("workflow_steps")
      .insert({ user_id: session.user.id, workflow_id: id, position, type, config })
      .select("id,workflow_id,position,type,config")
      .single();
    if (error) return toast.error(error.message);
    setSteps((prev) => [...prev, data as unknown as WorkflowStep]);
    setAdding(false);
  };

  const updateStep = async (stepId: string, config: StepConfig) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, config } : s)));
    await supabase.from("workflow_steps").update({ config }).eq("id", stepId);
  };

  const removeStep = async (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    await supabase.from("workflow_steps").delete().eq("id", stepId);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    const next = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }));
    setSteps(next);
    await Promise.all(next.map((s) => supabase.from("workflow_steps").update({ position: s.position }).eq("id", s.id)));
  };

  const runNow = async () => {
    if (!session) return;
    const { error } = await supabase.from("workflow_runs").insert({
      user_id: session.user.id, workflow_id: id, scheduled_for: new Date().toISOString(), status: "queued",
    });
    if (error) return toast.error(error.message);
    toast.success("Queued — the bridge picks it up on its next poll");
  };

  const removeWorkflow = async () => {
    await supabase.from("workflows").delete().eq("id", id);
    nav({ to: "/automations" });
  };

  if (loading || !session || !wf) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => nav({ to: "/automations" })} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Link to="/automations/$id/runs" params={{ id }} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
              <History className="h-4 w-4" />
            </Link>
            <button onClick={removeWorkflow} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        </div>

        <input
          value={wf.name}
          onChange={(e) => setWf({ ...wf, name: e.target.value })}
          onBlur={(e) => patchWorkflow({ name: e.target.value })}
          className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none"
        />

        {/* Trigger */}
        <div className="mt-4 glass rounded-3xl p-4 space-y-3">
          <p className="text-sm font-semibold">Trigger</p>
          <div className="grid grid-cols-3 gap-2">
            {TRIGGER_TYPES.map((t) => (
              <button key={t.value} onClick={() => patchWorkflow({ trigger_type: t.value })}
                className={`text-[11px] py-2.5 rounded-xl border transition ${wf.trigger_type === t.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
          {wf.trigger_type === "daily" && (
            <input type="time" value={wf.trigger_time?.slice(0, 5) ?? "10:00"}
              onChange={(e) => patchWorkflow({ trigger_time: e.target.value })}
              className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
          )}
          {wf.trigger_type === "interval" && (
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={wf.interval_minutes ?? 60}
                onChange={(e) => patchWorkflow({ interval_minutes: Number(e.target.value) })}
                className="flex-1 bg-input border border-border rounded-xl px-3 py-2 text-sm" />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          )}
          <button onClick={() => patchWorkflow({ enabled: !wf.enabled })}
            className={`w-full rounded-xl border py-2 text-xs flex items-center justify-center gap-1.5 ${wf.enabled ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
            <Power className="h-3.5 w-3.5" /> {wf.enabled ? "Enabled" : "Paused"}
          </button>
        </div>

        {/* Steps */}
        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm font-semibold">Steps</p>
          <span className="text-[11px] text-muted-foreground">Drag to reorder</span>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="mt-3 space-y-2.5">
              {steps.map((step, i) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  index={i}
                  presets={presets}
                  areas={areas}
                  describe={describeStep({ type: step.type, config: step.config ?? {} }, ctx)}
                  onChange={(cfg) => updateStep(step.id, cfg)}
                  onRemove={() => removeStep(step.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {steps.length === 0 && (
          <div className="mt-3 glass rounded-3xl p-6 text-center text-xs text-muted-foreground">
            Add a step: go to a preset, capture, save to an area, wait, then compare with AI.
          </div>
        )}

        {adding ? (
          <div className="mt-3 glass rounded-3xl p-3 space-y-2">
            {(Object.keys(STEP_META) as StepType[]).map((t) => {
              const Icon = ICONS[t];
              return (
                <button key={t} onClick={() => addStep(t)} className="w-full rounded-2xl p-3 flex items-center gap-3 text-left hover:bg-accent/40 transition">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary"><Icon className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-medium">{STEP_META[t].label}</p>
                    <p className="text-[11px] text-muted-foreground">{STEP_META[t].hint}</p>
                  </div>
                </button>
              );
            })}
            <button onClick={() => setAdding(false)} className="w-full text-xs text-muted-foreground py-2">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-3 w-full glass rounded-2xl py-3.5 text-sm font-medium flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Add step
          </button>
        )}

        <button onClick={runNow} className="mt-3 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua flex items-center justify-center gap-2">
          <Play className="h-4 w-4" /> Run now
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground text-center">
          Runs are executed by your home bridge. Set it up from the camera's Presets tab.
        </p>
      </div>
    </MobileShell>
  );
}

function SortableStep({
  step, index, presets, areas, describe, onChange, onRemove,
}: {
  step: WorkflowStep; index: number; presets: Preset[]; areas: Area[]; describe: string;
  onChange: (cfg: StepConfig) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const [open, setOpen] = useState(false);
  const cfg = step.config ?? {};
  const Icon = ICONS[step.type];
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined };

  const set = (patch: StepConfig) => onChange({ ...cfg, ...patch });

  return (
    <div ref={setNodeRef} style={style} className={`glass rounded-3xl p-3 ${isDragging ? "opacity-90 ring-1 ring-primary/40" : ""}`}>
      <div className="flex items-center gap-2.5">
        <button {...attributes} {...listeners} className="h-9 w-7 flex items-center justify-center text-muted-foreground touch-none cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="h-9 w-9 rounded-xl gradient-reef flex items-center justify-center text-primary-foreground shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <button onClick={() => setOpen((o) => !o)} className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium">{index + 1}. {STEP_META[step.type].label}</p>
          <p className="text-[11px] text-muted-foreground truncate">{describe}</p>
        </button>
        <button onClick={onRemove} className="h-8 w-8 rounded-xl flex items-center justify-center">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
          {step.type === "goto_preset" && (
            <>
              <Field label="Preset">
                <select value={cfg.presetId ?? ""} onChange={(e) => set({ presetId: e.target.value })} className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm">
                  <option value="">Choose…</option>
                  {presets.map((p) => <option key={p.id} value={p.id}>#{p.preset_number} · {p.name}</option>)}
                </select>
              </Field>
              <Field label="Settle time (seconds)">
                <input type="number" min={0} value={(cfg.settleMs ?? 3000) / 1000} onChange={(e) => set({ settleMs: Number(e.target.value) * 1000 })}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
              </Field>
              {presets.length === 0 && <p className="text-[11px] text-muted-foreground">No presets imported yet — run the bridge once to sync them.</p>}
            </>
          )}

          {step.type === "capture" && (
            <>
              <Field label="Mode">
                <div className="grid grid-cols-2 gap-2">
                  {(["photo", "burst"] as const).map((m) => (
                    <button key={m} onClick={() => set({ mode: m })}
                      className={`py-2 rounded-xl border text-xs capitalize ${(cfg.mode ?? "photo") === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                      {m === "photo" ? "Single photo" : "5-sec burst"}
                    </button>
                  ))}
                </div>
              </Field>
              {cfg.mode === "burst" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Frames">
                    <input type="number" min={2} max={30} value={cfg.frames ?? 10} onChange={(e) => set({ frames: Number(e.target.value) })}
                      className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Over (seconds)">
                    <input type="number" min={1} value={(cfg.durationMs ?? 5000) / 1000} onChange={(e) => set({ durationMs: Number(e.target.value) * 1000 })}
                      className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
                  </Field>
                </div>
              )}
              <Field label="Save into (optional — otherwise uses the current area)">
                <AreaSelect areas={areas} value={cfg.areaId} onChange={(areaId) => set({ areaId })} />
              </Field>
            </>
          )}

          {step.type === "save_area" && (
            <Field label="Area folder">
              <AreaSelect areas={areas} value={cfg.areaId} onChange={(areaId) => set({ areaId })} />
            </Field>
          )}

          {step.type === "wait" && (
            <Field label="Delay (seconds)">
              <input type="number" min={1} value={cfg.seconds ?? 30} onChange={(e) => set({ seconds: Number(e.target.value) })}
                className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm" />
            </Field>
          )}

          {step.type === "ai_compare" && (
            <>
              <Field label="Area to compare">
                <AreaSelect areas={areas} value={cfg.areaId} onChange={(areaId) => set({ areaId })} />
              </Field>
              <Field label="Compare now against">
                <div className="grid grid-cols-4 gap-2">
                  {OFFSET_OPTIONS.map((o) => {
                    const active = (cfg.offsets ?? []).includes(o.minutes);
                    return (
                      <button key={o.minutes}
                        onClick={() => set({ offsets: active ? (cfg.offsets ?? []).filter((m) => m !== o.minutes) : [...(cfg.offsets ?? []), o.minutes].sort((a, b) => a - b) })}
                        className={`py-2 rounded-xl border text-[11px] ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function AreaSelect({ areas, value, onChange }: { areas: Area[]; value?: string; onChange: (v: string) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm">
      <option value="">Choose…</option>
      {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}
