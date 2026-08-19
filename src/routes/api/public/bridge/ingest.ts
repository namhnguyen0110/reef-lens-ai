import { createFileRoute } from "@tanstack/react-router";
import { authenticateBridge, json } from "@/lib/bridge-auth.server";

export const Route = createFileRoute("/api/public/bridge/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateBridge(request);
        if (!auth) return json({ error: "Unauthorized" }, 401);
        const { admin, device } = auth;

        const form = await request.formData().catch(() => null);
        if (!form) return json({ error: "multipart/form-data required" }, 400);
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) return json({ error: "file required" }, 400);

        const areaId = (form.get("areaId") as string) || null;
        const runId = (form.get("runId") as string) || null;
        const cameraId = (form.get("cameraId") as string) || device.camera_id;
        const burstGroupId = (form.get("burstGroupId") as string) || null;
        const capturedAt = (form.get("capturedAt") as string) || new Date().toISOString();
        const label = (form.get("label") as string) || "automation";

        const at = new Date(capturedAt);
        const storagePath = `${device.user_id}/bridge/${cameraId ?? "camera"}/${at.getTime()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.jpg`;

        const bytes = new Uint8Array(await file.arrayBuffer());
        const { error: upErr } = await admin.storage
          .from("tank-photos")
          .upload(storagePath, bytes, { contentType: "image/jpeg" });
        if (upErr) return json({ error: upErr.message }, 500);

        const { data: pub } = admin.storage.from("tank-photos").getPublicUrl(storagePath);

        const { data: photo, error } = await admin
          .from("photos")
          .insert({
            user_id: device.user_id,
            camera_id: cameraId,
            area_id: areaId,
            burst_group_id: burstGroupId,
            auto_captured: true,
            captured_at: at.toISOString(),
            storage_path: storagePath,
            image_url: pub.publicUrl,
            status: "pending",
            tags: ["auto", "automation", label].filter(Boolean),
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);

        if (cameraId) {
          await admin.from("cameras").update({ last_snapshot_at: at.toISOString() }).eq("id", cameraId);
        }
        if (runId) {
          await admin
            .from("workflow_runs")
            .update({ lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
            .eq("id", runId);
        }

        return json({ ok: true, photoId: photo.id, imageUrl: pub.publicUrl });
      },
    },
  },
});
