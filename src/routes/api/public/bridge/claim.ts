import { createFileRoute } from "@tanstack/react-router";
import { authenticateBridge, json } from "@/lib/bridge-auth.server";

const LEASE_MS = 10 * 60 * 1000;

type Body = { localTime?: string; localDate?: string };

export const Route = createFileRoute("/api/public/bridge/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateBridge(request);
        if (!auth) return json({ error: "Unauthorized" }, 401);
        const { admin, device } = auth;

        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          body = {};
        }
        const now = new Date();
        const localTime = typeof body.localTime === "string" ? body.localTime : now.toISOString().slice(11, 16);

        // 1) Enqueue any due scheduled workflows for this user.
        const { data: workflows } = await admin
          .from("workflows")
          .select("id,user_id,trigger_type,trigger_time,interval_minutes,enabled,last_run_at,camera_id")
          .eq("user_id", device.user_id)
          .eq("enabled", true);

        for (const wf of workflows ?? []) {
          const last = wf.last_run_at ? new Date(wf.last_run_at).getTime() : 0;
          let due = false;
          if (wf.trigger_type === "interval" && wf.interval_minutes) {
            due = now.getTime() - last >= wf.interval_minutes * 60_000;
          } else if (wf.trigger_type === "daily" && wf.trigger_time) {
            const passed = localTime >= wf.trigger_time.slice(0, 5);
            due = passed && now.getTime() - last > 23 * 60 * 60 * 1000;
          }
          if (!due) continue;
          // Idempotent on (workflow_id, scheduled_for) — bucket to the minute.
          const bucket = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
          await admin
            .from("workflow_runs")
            .insert({
              user_id: wf.user_id,
              workflow_id: wf.id,
              scheduled_for: bucket,
              status: "queued",
            })
            .select()
            .maybeSingle();
          await admin.from("workflows").update({ last_run_at: now.toISOString() }).eq("id", wf.id);
        }

        // 2) Claim the oldest queued (or stale-leased) run.
        const { data: candidates } = await admin
          .from("workflow_runs")
          .select("id,workflow_id,status,lease_expires_at,scheduled_for")
          .eq("user_id", device.user_id)
          .in("status", ["queued", "running"])
          .order("scheduled_for", { ascending: true })
          .limit(5);

        const claimable = (candidates ?? []).find(
          (r) => r.status === "queued" || (r.lease_expires_at && new Date(r.lease_expires_at).getTime() < now.getTime()),
        );
        if (!claimable) return json({ run: null });

        const { data: claimed } = await admin
          .from("workflow_runs")
          .update({
            status: "running",
            claimed_by: device.id,
            lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
            started_at: now.toISOString(),
          })
          .eq("id", claimable.id)
          .eq("status", claimable.status)
          .select()
          .maybeSingle();
        if (!claimed) return json({ run: null });

        const { data: workflow } = await admin
          .from("workflows")
          .select("id,name,camera_id")
          .eq("id", claimed.workflow_id)
          .maybeSingle();

        const { data: steps } = await admin
          .from("workflow_steps")
          .select("id,position,type,config")
          .eq("workflow_id", claimed.workflow_id)
          .order("position", { ascending: true });

        // Resolve preset numbers so the bridge does not need extra lookups.
        const presetIds = (steps ?? [])
          .map((s) => (s.config as { presetId?: string })?.presetId)
          .filter(Boolean) as string[];
        let presetMap: Record<string, { preset_number: number; name: string; settle_ms: number; area_id: string | null }> = {};
        if (presetIds.length) {
          const { data: presets } = await admin
            .from("camera_presets")
            .select("id,preset_number,name,settle_ms,area_id")
            .in("id", presetIds);
          presetMap = Object.fromEntries((presets ?? []).map((p) => [p.id, p]));
        }

        // Seed run-step rows so the UI can show progress immediately.
        const runSteps = (steps ?? []).map((s) => ({
          user_id: device.user_id,
          run_id: claimed.id,
          step_id: s.id,
          position: s.position,
          type: s.type,
          status: "pending",
        }));
        if (runSteps.length) {
          await admin.from("workflow_run_steps").delete().eq("run_id", claimed.id);
          await admin.from("workflow_run_steps").insert(runSteps);
        }

        return json({
          run: {
            id: claimed.id,
            workflow: workflow ?? null,
            steps: (steps ?? []).map((s) => ({
              ...s,
              preset: (s.config as { presetId?: string })?.presetId
                ? presetMap[(s.config as { presetId?: string }).presetId!] ?? null
                : null,
            })),
          },
        });
      },
    },
  },
});
