// Shared (client-safe) definitions for the automation workflow builder.

export type StepType = "goto_preset" | "capture" | "save_area" | "wait" | "ai_compare";

export type StepConfig = {
  presetId?: string;
  settleMs?: number;
  mode?: "photo" | "burst";
  frames?: number;
  durationMs?: number;
  areaId?: string;
  seconds?: number;
  offsets?: number[];
  label?: string;
};

export type WorkflowStep = {
  id: string;
  workflow_id: string;
  position: number;
  type: StepType;
  config: StepConfig;
};

export const STEP_META: Record<StepType, { label: string; hint: string; icon: string }> = {
  goto_preset: { label: "Go to preset", hint: "Pan/zoom the camera to a saved position", icon: "move" },
  capture: { label: "Capture", hint: "Take a photo or a 5-second burst", icon: "camera" },
  save_area: { label: "Save to area", hint: "File the next captures into a folder", icon: "folder" },
  wait: { label: "Wait", hint: "Delay before the next step", icon: "timer" },
  ai_compare: { label: "AI compare", hint: "Compare an area now vs earlier", icon: "sparkles" },
};

export const OFFSET_OPTIONS = [
  { minutes: 5, label: "5 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "1 week" },
];

export const TRIGGER_TYPES = [
  { value: "manual", label: "Manual only" },
  { value: "daily", label: "Every day at…" },
  { value: "interval", label: "Every N minutes" },
] as const;

export function defaultConfig(type: StepType): StepConfig {
  switch (type) {
    case "goto_preset":
      return { settleMs: 3000 };
    case "capture":
      return { mode: "photo", frames: 10, durationMs: 5000 };
    case "save_area":
      return {};
    case "wait":
      return { seconds: 30 };
    case "ai_compare":
      return { offsets: [5, 60, 1440] };
  }
}

export function describeStep(
  step: { type: StepType; config: StepConfig },
  ctx: { presets: Record<string, string>; areas: Record<string, string> },
): string {
  const c = step.config ?? {};
  switch (step.type) {
    case "goto_preset":
      return `${c.presetId ? ctx.presets[c.presetId] ?? "Unknown preset" : "Pick a preset"} · settle ${(c.settleMs ?? 3000) / 1000}s`;
    case "capture":
      return c.mode === "burst" ? `Burst · ${c.frames ?? 10} frames over ${(c.durationMs ?? 5000) / 1000}s` : "Single photo";
    case "save_area":
      return c.areaId ? ctx.areas[c.areaId] ?? "Unknown area" : "Pick an area";
    case "wait":
      return `${c.seconds ?? 30} seconds`;
    case "ai_compare":
      return `${c.areaId ? ctx.areas[c.areaId] ?? "Area" : "Pick an area"} · now vs ${(c.offsets ?? []).map((m) => (m >= 1440 ? `${m / 1440}d` : m >= 60 ? `${m / 60}h` : `${m}m`)).join(" · ")}`;
  }
}
