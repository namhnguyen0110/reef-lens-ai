// Creates dummy areas, PTZ presets, backdated photos and a sample workflow so the
// whole automation flow can be tested without a camera or the LAN bridge.
import { supabase } from "@/integrations/supabase/client";

export const SAMPLE_IMAGES = [
  { label: "Reef 1", url: "/seed/tank1.jpg" },
  { label: "Reef 2", url: "/seed/tank2.jpg" },
  { label: "Reef 3", url: "/seed/tank3.jpg" },
  { label: "Reef 4", url: "/seed/tank4.jpg" },
];

export const DEMO_AREAS = ["Skimmer", "SPS rack", "LPS bed", "Wavemaker"];

export function absolute(url: string) {
  return url.startsWith("http") ? url : `${window.location.origin}${url}`;
}

export async function seedDemoSetup(userId: string) {
  // 1. Camera
  let { data: cam } = await supabase.from("cameras").select("id,tank_id").limit(1).maybeSingle();
  if (!cam) {
    const { data: tank } = await supabase.from("tanks").select("id").limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("cameras")
      .insert({ user_id: userId, name: "Demo reef camera", brand: "mock", tank_id: tank?.id ?? null, mock_seed: 3 })
      .select("id,tank_id")
      .single();
    if (error) throw new Error(error.message);
    cam = data;
  }

  // 2. Areas
  const { data: existingAreas } = await supabase.from("areas").select("id,name");
  const areaByName = new Map((existingAreas ?? []).map((a) => [a.name, a.id]));
  const missingAreas = DEMO_AREAS.filter((n) => !areaByName.has(n));
  if (missingAreas.length) {
    const { data, error } = await supabase
      .from("areas")
      .insert(missingAreas.map((name) => ({ user_id: userId, name, tank_id: cam?.tank_id ?? null })))
      .select("id,name");
    if (error) throw new Error(error.message);
    for (const a of data ?? []) areaByName.set(a.name, a.id);
  }

  // 3. Presets (one per area)
  const { data: existingPresets } = await supabase
    .from("camera_presets")
    .select("id,preset_number")
    .eq("camera_id", cam!.id);
  const known = new Set((existingPresets ?? []).map((p) => p.preset_number));
  const toAdd = DEMO_AREAS.map((name, i) => ({
    user_id: userId,
    camera_id: cam!.id,
    preset_number: i + 1,
    name,
    area_id: areaByName.get(name) ?? null,
    settle_ms: 3000,
  })).filter((p) => !known.has(p.preset_number));
  if (toAdd.length) {
    const { error } = await supabase.from("camera_presets").insert(toAdd);
    if (error) throw new Error(error.message);
  }

  // 4. Backdated history photos so "AI compare" has earlier frames to look back at
  const offsets = [10080, 1440, 60, 5]; // 1w, 1d, 1h, 5m ago
  let seeded = 0;
  for (const [i, name] of DEMO_AREAS.entries()) {
    const areaId = areaByName.get(name)!;
    const { count } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("area_id", areaId);
    if ((count ?? 0) >= offsets.length) continue;
    const rows = offsets.map((mins, k) => {
      const at = new Date(Date.now() - mins * 60_000);
      const url = absolute(SAMPLE_IMAGES[(i + k) % SAMPLE_IMAGES.length].url);
      return {
        user_id: userId,
        camera_id: cam!.id,
        tank_id: cam!.tank_id ?? null,
        area_id: areaId,
        auto_captured: true,
        captured_at: at.toISOString(),
        image_url: url,
        storage_path: `demo://${areaId}/${at.getTime()}`,
        status: "pending",
        tags: ["demo", "auto", name.toLowerCase()],
      };
    });
    const { error } = await supabase.from("photos").insert(rows);
    if (error) throw new Error(error.message);
    seeded += rows.length;
  }

  // 5. Demo workflow with a full step chain
  const { data: existingWf } = await supabase
    .from("workflows")
    .select("id")
    .eq("name", "Demo preset tour")
    .maybeSingle();
  let workflowId = existingWf?.id ?? null;
  if (!workflowId) {
    const { data: wf, error } = await supabase
      .from("workflows")
      .insert({
        user_id: userId,
        name: "Demo preset tour",
        camera_id: cam!.id,
        trigger_type: "daily",
        trigger_time: "10:00:00",
        enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    workflowId = wf.id;

    const { data: presets } = await supabase
      .from("camera_presets")
      .select("id,preset_number,area_id")
      .eq("camera_id", cam!.id)
      .order("preset_number");
    const p1 = presets?.[0];
    const p2 = presets?.[1];
    const steps = [
      { type: "goto_preset", config: { presetId: p1?.id, settleMs: 3000 } },
      { type: "capture", config: { mode: "photo" } },
      { type: "save_area", config: { areaId: p1?.area_id ?? areaByName.get(DEMO_AREAS[0]) } },
      { type: "wait", config: { seconds: 5 } },
      { type: "goto_preset", config: { presetId: p2?.id, settleMs: 3000 } },
      { type: "capture", config: { mode: "burst", frames: 3, durationMs: 5000 } },
      { type: "save_area", config: { areaId: p2?.area_id ?? areaByName.get(DEMO_AREAS[1]) } },
      { type: "ai_compare", config: { areaId: p1?.area_id ?? areaByName.get(DEMO_AREAS[0]), offsets: [5, 60, 1440] } },
    ];
    const { error: sErr } = await supabase.from("workflow_steps").insert(
      steps.map((s, i) => ({ user_id: userId, workflow_id: workflowId!, position: i, type: s.type, config: s.config })),
    );
    if (sErr) throw new Error(sErr.message);
  }

  return { workflowId, areas: DEMO_AREAS.length, presets: DEMO_AREAS.length, seededPhotos: seeded };
}
