import { createFileRoute } from "@tanstack/react-router";
import { authenticateBridge, json } from "@/lib/bridge-auth.server";

type Body = {
  runId?: string;
  position?: number;
  type?: string;
  status?: "running" | "done" | "failed" | "skipped";
  detail?: string;
  photoIds?: string[];
  runStatus?: "running" | "done" | "failed";
  runError?: string;
};

export const Route = createFileRoute("/api/public/bridge/step")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateBridge(request);
        if (!auth) return json({ error: "Unauthorized" }, 401);
        const { admin, device } = auth;

        const body = (await request.json().catch(() => ({}))) as Body;
        if (!body.runId) return json({ error: "runId required" }, 400);

        const { data: run } = await admin
          .from("workflow_runs")
          .select("id,user_id")
          .eq("id", body.runId)
          .maybeSingle();
        if (!run || run.user_id !== device.user_id) return json({ error: "Run not found" }, 404);

        const now = new Date().toISOString();

        if (typeof body.position === "number" && body.status) {
          const patch: Record<string, unknown> = { status: body.status, detail: body.detail ?? null };
          if (body.status === "running") patch['started_at'] = now;
          else patch['finished_at'] = now;
          if (body.photoIds?.length) patch['photo_ids'] = body.photoIds;
          const { data: updated } = await admin
            .from("workflow_run_steps")
            .update(patch)
            .eq("run_id", body.runId)
            .eq("position", body.position)
            .select("id");
          if (!updated?.length) {
            await admin.from("workflow_run_steps").insert({
              user_id: device.user_id,
              run_id: body.runId,
              position: body.position,
              type: body.type ?? "unknown",
              ...patch,
            });
          }
        }

        if (body.runStatus) {
          await admin
            .from("workflow_runs")
            .update({
              status: body.runStatus,
              error: body.runError ?? null,
              finished_at: body.runStatus === "running" ? null : now,
              lease_expires_at:
                body.runStatus === "running" ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null,
            })
            .eq("id", body.runId);
        }

        return json({ ok: true });
      },
    },
  },
});
