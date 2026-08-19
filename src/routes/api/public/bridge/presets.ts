import { createFileRoute } from "@tanstack/react-router";
import { authenticateBridge, json } from "@/lib/bridge-auth.server";

type Body = {
  cameraId?: string;
  presets?: { number: number; name?: string }[];
};

export const Route = createFileRoute("/api/public/bridge/presets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateBridge(request);
        if (!auth) return json({ error: "Unauthorized" }, 401);
        const { admin, device } = auth;

        const body = (await request.json().catch(() => ({}))) as Body;
        const cameraId = body.cameraId || device.camera_id;
        if (!cameraId) return json({ error: "No camera bound to this bridge" }, 400);
        if (!Array.isArray(body.presets)) return json({ error: "presets[] required" }, 400);

        const { data: camera } = await admin
          .from("cameras")
          .select("id,user_id")
          .eq("id", cameraId)
          .maybeSingle();
        if (!camera || camera.user_id !== device.user_id) return json({ error: "Camera not found" }, 404);

        const rows = body.presets
          .filter((p) => Number.isFinite(p.number))
          .slice(0, 300)
          .map((p) => ({
            user_id: device.user_id,
            camera_id: cameraId,
            preset_number: Math.trunc(p.number),
            name: (p.name || `Preset ${p.number}`).slice(0, 120),
          }));

        // Keep any names the user renamed in-app: only insert missing numbers.
        const { data: existing } = await admin
          .from("camera_presets")
          .select("preset_number")
          .eq("camera_id", cameraId);
        const known = new Set((existing ?? []).map((e) => e.preset_number));
        const toInsert = rows.filter((r) => !known.has(r.preset_number));
        if (toInsert.length) {
          const { error } = await admin.from("camera_presets").insert(toInsert);
          if (error) return json({ error: error.message }, 500);
        }
        return json({ ok: true, synced: rows.length, added: toInsert.length });
      },
    },
  },
});
