// Runs a workflow entirely in the browser using a sample image, so the whole
// flow (capture -> area folder -> AI compare) can be tested with no LAN bridge.
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowStep } from "@/lib/workflow-steps";

export type SimProgress = { position: number; label: string; status: "running" | "done" | "failed"; detail?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchSampleBlob(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load sample image (${res.status})`);
  return await res.blob();
}

export async function simulateWorkflow(opts: {
  userId: string;
  workflowId: string;
  cameraId: string | null;
  steps: WorkflowStep[];
  image: Blob;
  presets: { id: string; name: string; preset_number: number; area_id: string | null }[];
  onProgress?: (p: SimProgress) => void;
}) {
  const { userId, workflowId, cameraId, steps, image, presets, onProgress } = opts;

  const { data: run, error: runErr } = await supabase
    .from("workflow_runs")
    .insert({
      user_id: userId,
      workflow_id: workflowId,
      scheduled_for: new Date().toISOString(),
      status: "running",
      started_at: new Date().toISOString(),
      claimed_by: "simulator",
    })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);

  let currentAreaId: string | null = null;
  let pending: string[] = [];
  let failure: string | null = null;
  let currentPosition = 0;

  const rowIds = new Map<number, string>();
  const mark = async (position: number, type: string, status: string, detail?: string, extra?: Record<string, unknown>) => {
    const patch = {
      status,
      detail: detail ?? null,
      finished_at: status === "running" ? null : new Date().toISOString(),
      ...extra,
    };
    const existing = rowIds.get(position);
    if (existing) {
      await supabase.from("workflow_run_steps").update(patch).eq("id", existing);
      return;
    }
    const { data } = await supabase
      .from("workflow_run_steps")
      .insert({
        user_id: userId,
        run_id: run.id,
        position,
        type,
        started_at: new Date().toISOString(),
        ...patch,
      })
      .select("id")
      .single();
    if (data) rowIds.set(position, data.id);
  };

  const uploadFrame = async (areaId: string | null, index: number) => {
    const at = new Date(Date.now() + index * 400);
    const path = `${userId}/simulated/${at.getTime()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error: upErr } = await supabase.storage.from("tank-photos").upload(path, image, { contentType: "image/jpeg" });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage.from("tank-photos").getPublicUrl(path);
    const { data, error } = await supabase
      .from("photos")
      .insert({
        user_id: userId,
        camera_id: cameraId,
        area_id: areaId,
        auto_captured: true,
        captured_at: at.toISOString(),
        storage_path: path,
        image_url: pub.publicUrl,
        status: "pending",
        tags: ["auto", "automation", "simulated"],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  };

  try {
    for (const step of steps) {
      const cfg = step.config ?? {};
      currentPosition = step.position;
      await mark(step.position, step.type, "running");
      onProgress?.({ position: step.position, label: step.type, status: "running" });

      let detail = "";
      const extra: Record<string, unknown> = {};

      switch (step.type) {
        case "goto_preset": {
          const p = presets.find((x) => x.id === cfg.presetId);
          currentAreaId = p?.area_id ?? currentAreaId;
          await sleep(Math.min(cfg.settleMs ?? 3000, 1200));
          detail = p ? `Simulated move to ${p.name} (#${p.preset_number})` : "No preset selected — skipped move";
          break;
        }
        case "capture": {
          const frames = cfg.mode === "burst" ? Math.min(cfg.frames ?? 3, 5) : 1;
          const ids: string[] = [];
          for (let i = 0; i < frames; i++) ids.push(await uploadFrame(currentAreaId, i));
          pending = [...pending, ...ids];
          extra.photo_ids = ids;
          detail = frames === 1 ? "Captured 1 sample frame" : `Captured ${frames} sample frames`;
          break;
        }
        case "save_area": {
          currentAreaId = cfg.areaId ?? currentAreaId;
          if (currentAreaId && pending.length) {
            await supabase.from("photos").update({ area_id: currentAreaId }).in("id", pending);
          }
          extra.photo_ids = pending;
          detail = currentAreaId ? `Filed ${pending.length} photo(s) into area` : "No area selected";
          pending = [];
          break;
        }
        case "wait": {
          await sleep(Math.min((cfg.seconds ?? 30) * 1000, 1500));
          detail = `Waited (simulated ${cfg.seconds ?? 30}s)`;
          break;
        }
        case "ai_compare": {
          const areaId = cfg.areaId ?? currentAreaId;
          if (!areaId) throw new Error("AI compare has no area selected");
          const { data: photos } = await supabase
            .from("photos")
            .select("id,captured_at")
            .eq("area_id", areaId)
            .order("captured_at", { ascending: false })
            .limit(50);
          const list = photos ?? [];
          if (list.length < 2) throw new Error("Need at least 2 photos in that area to compare");
          const newer = list[0];
          const nowMs = new Date(newer.captured_at ?? Date.now()).getTime();
          const offsets = cfg.offsets?.length ? cfg.offsets : [60];
          const target = nowMs - Math.min(...offsets) * 60_000;
          const older =
            list.slice(1).find((p) => new Date(p.captured_at ?? 0).getTime() <= target) ?? list[list.length - 1];

          const { data, error } = await supabase.functions.invoke("compare-photos", {
            body: { photoIdA: older.id, photoIdB: newer.id },
          });
          if (error) throw new Error(error.message);
          const result = data.result as { summary: string; trend: string; changes?: string[]; recommendations?: string[] };
          const { data: cmp } = await supabase
            .from("comparisons")
            .insert({
              user_id: userId,
              photo_older_id: older.id,
              photo_newer_id: newer.id,
              summary: result.summary,
              trend: result.trend,
              changes: result.changes ?? [],
              recommendations: result.recommendations ?? [],
              raw: result,
            })
            .select("id")
            .single();
          extra.comparison_id = cmp?.id ?? null;
          extra.photo_ids = [older.id, newer.id];
          detail = `${result.trend} — ${result.summary}`;
          break;
        }
      }

      await mark(step.position, step.type, "done", detail, extra);
      onProgress?.({ position: step.position, label: step.type, status: "done", detail });
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : "Simulation failed";
    const failedStep = steps.find((s) => s.position === currentPosition);
    if (failedStep) {
      await mark(failedStep.position, failedStep.type, "failed", failure);
      onProgress?.({ position: failedStep.position, label: failedStep.type, status: "failed", detail: failure });
    }
  }

  await supabase
    .from("workflow_runs")
    .update({
      status: failure ? "failed" : "done",
      error: failure,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await supabase.from("workflows").update({ last_run_at: new Date().toISOString() }).eq("id", workflowId);

  if (failure) throw new Error(failure);
  return { runId: run.id };
}
