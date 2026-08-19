import { createFileRoute } from "@tanstack/react-router";
import { authenticateBridge, json } from "@/lib/bridge-auth.server";

type Body = {
  runId?: string;
  position?: number;
  areaId?: string;
  /** Lookback offsets in minutes, e.g. [5, 60, 1440]. */
  offsets?: number[];
};

const TOOL = [
  {
    type: "function",
    function: {
      name: "report_comparison",
      description: "Summarize visual changes across a time series of reef tank photos of the same area.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          trend: { type: "string", enum: ["Improving", "Stable", "Worsening", "Mixed"] },
          changes: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "trend", "changes", "recommendations"],
      },
    },
  },
];

export const Route = createFileRoute("/api/public/bridge/compare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateBridge(request);
        if (!auth) return json({ error: "Unauthorized" }, 401);
        const { admin, device } = auth;

        const body = (await request.json().catch(() => ({}))) as Body;
        if (!body.areaId) return json({ error: "areaId required" }, 400);
        const offsets = (body.offsets?.length ? body.offsets : [5, 60, 1440]).slice(0, 6);

        // Newest photo in the area = the "now" frame.
        const { data: latest } = await admin
          .from("photos")
          .select("id,image_url,captured_at,diagnosis")
          .eq("user_id", device.user_id)
          .eq("area_id", body.areaId)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latest) return json({ error: "No photos in this area yet" }, 400);

        const nowMs = new Date(latest.captured_at ?? Date.now()).getTime();
        const olderFrames: { id: string; image_url: string; captured_at: string | null; label: string }[] = [];
        for (const minutes of offsets) {
          const target = new Date(nowMs - minutes * 60_000).toISOString();
          const { data } = await admin
            .from("photos")
            .select("id,image_url,captured_at")
            .eq("user_id", device.user_id)
            .eq("area_id", body.areaId)
            .lte("captured_at", target)
            .order("captured_at", { ascending: false })
            .limit(1);
          const hit = data?.[0];
          if (hit && !olderFrames.some((f) => f.id === hit.id)) {
            olderFrames.push({ ...hit, label: minutes >= 1440 ? `${Math.round(minutes / 1440)}d ago` : minutes >= 60 ? `${Math.round(minutes / 60)}h ago` : `${minutes}m ago` });
          }
        }
        if (!olderFrames.length) return json({ error: "No earlier photos to compare against" }, 400);

        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return json({ error: "AI is not configured" }, 500);

        const content: unknown[] = [];
        for (const f of [...olderFrames].reverse()) {
          content.push({ type: "text", text: `${f.label} (${f.captured_at})` });
          content.push({ type: "image_url", image_url: { url: f.image_url } });
        }
        content.push({ type: "text", text: `NOW (${latest.captured_at})` });
        content.push({ type: "image_url", image_url: { url: latest.image_url } });

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are an expert reef-tank veterinarian. The images are the same tank area over time, oldest first, the last one is NOW. Call report_comparison describing what changed: coral colour and extension, algae, detritus, skimmer output, equipment, fish behaviour.",
              },
              { role: "user", content },
            ],
            tools: TOOL,
            tool_choice: { type: "function", function: { name: "report_comparison" } },
          }),
        });

        if (!aiRes.ok) {
          const text = await aiRes.text();
          return json({ error: `AI error ${aiRes.status}: ${text}`, retryable: aiRes.status === 429 || aiRes.status >= 500 }, aiRes.status === 429 ? 429 : 502);
        }

        const data = (await aiRes.json()) as {
          choices?: { message?: { tool_calls?: { function: { arguments: string } }[] } }[];
        };
        const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!args) return json({ error: "AI returned no structured result" }, 502);
        const result = JSON.parse(args) as {
          summary: string;
          trend: string;
          changes: string[];
          recommendations: string[];
        };

        const oldest = olderFrames[olderFrames.length - 1];
        const { data: comparison } = await admin
          .from("comparisons")
          .insert({
            user_id: device.user_id,
            photo_older_id: oldest.id,
            photo_newer_id: latest.id,
            summary: result.summary,
            trend: result.trend,
            changes: result.changes,
            recommendations: result.recommendations,
            raw: { ...result, frames: olderFrames.map((f) => ({ id: f.id, label: f.label })) },
          })
          .select("id")
          .single();

        if (body.runId && typeof body.position === "number") {
          await admin
            .from("workflow_run_steps")
            .update({
              status: "done",
              detail: `${result.trend} — ${result.summary}`,
              comparison_id: comparison?.id ?? null,
              finished_at: new Date().toISOString(),
            })
            .eq("run_id", body.runId)
            .eq("position", body.position);
        }

        return json({ ok: true, comparisonId: comparison?.id ?? null, result });
      },
    },
  },
});
