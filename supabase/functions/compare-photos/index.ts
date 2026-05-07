// Edge function: compares two reef tank photos and writes a summary.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoIdA, photoIdB } = await req.json();
    if (!photoIdA || !photoIdB) throw new Error("photoIdA and photoIdB required");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: photos, error } = await supabase
      .from("photos").select("id,image_url,diagnosis,created_at,notes")
      .in("id", [photoIdA, photoIdB]);
    if (error || !photos || photos.length < 2) throw new Error("photos not found");

    const a = photos.find(p => p.id === photoIdA)!;
    const b = photos.find(p => p.id === photoIdB)!;

    const tools = [{
      type: "function",
      function: {
        name: "report_comparison",
        description: "Summarize visual changes between two reef tank photos.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "1-2 sentences plain-English summary of changes" },
            trend: { type: "string", enum: ["Improving", "Stable", "Worsening", "Mixed"] },
            changes: { type: "array", items: { type: "string" }, description: "Bullet list of concrete visual differences" },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "trend", "changes", "recommendations"],
        },
      },
    }];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an expert reef-tank veterinarian. Compare two photos of the same tank and call report_comparison. The first image is OLDER, the second is NEWER. Focus on coral color/extension, fish appearance, algae growth, and visible disease.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Older (${a.created_at}) — diagnosis: ${a.diagnosis ?? "n/a"}` },
              { type: "image_url", image_url: { url: a.image_url } },
              { type: "text", text: `Newer (${b.created_at}) — diagnosis: ${b.diagnosis ?? "n/a"}` },
              { type: "image_url", image_url: { url: b.image_url } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "report_comparison" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI error ${aiRes.status}: ${t}`);
    }

    const data = await aiRes.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = call ? JSON.parse(call.function.arguments) : null;
    if (!args) throw new Error("AI did not return structured result");

    return new Response(JSON.stringify({ ok: true, result: args, older: a, newer: b }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compare-photos error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
