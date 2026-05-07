// Edge function: analyzes a tank photo via Lovable AI Gateway and updates the photo row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoId } = await req.json();
    if (!photoId) throw new Error("photoId required");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: photo, error } = await supabase
      .from("photos").select("*").eq("id", photoId).single();
    if (error || !photo) throw new Error(error?.message ?? "photo not found");

    await supabase.from("photos").update({ status: "analyzing" }).eq("id", photoId);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const tools = [{
      type: "function",
      function: {
        name: "report_diagnosis",
        description: "Return a structured reef tank diagnosis.",
        parameters: {
          type: "object",
          properties: {
            diagnosis: { type: "string", description: "Primary issue or 'Healthy'" },
            confidence: { type: "number", description: "0-100" },
            severity: { type: "string", enum: ["None", "Mild", "Moderate", "Severe"] },
            affected_area: { type: "string" },
            explanation: { type: "string", description: "2-3 sentences in reef-hobbyist language" },
            tags: { type: "array", items: { type: "string" } },
            alternatives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["name", "confidence"],
              },
            },
            treatment_plan: {
              type: "object",
              properties: {
                steps: { type: "array", items: { type: "string" } },
                medication: { type: "string" },
                dosage: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
                recovery_timeline: { type: "string" },
                monitor: { type: "array", items: { type: "string" } },
              },
              required: ["steps", "monitor"],
            },
          },
          required: ["diagnosis", "confidence", "severity", "explanation", "tags", "alternatives", "treatment_plan"],
        },
      },
    }];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "You are an expert reef-tank veterinarian and aquarist. Analyze the photo for fish disease, coral stress/bleaching/retraction, algae, dinos, and tank health. Always call report_diagnosis. Use plain reef-hobbyist language. If healthy, set diagnosis='Healthy' and severity='None'.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Notes from owner: ${photo.notes ?? "(none)"}\nTags: ${(photo.tags ?? []).join(", ") || "(none)"}` },
              { type: "image_url", image_url: { url: photo.image_url } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "report_diagnosis" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted. Add credits in workspace.");
      throw new Error(`AI error ${aiRes.status}: ${t}`);
    }

    const data = await aiRes.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = call ? JSON.parse(call.function.arguments) : null;
    if (!args) throw new Error("AI did not return structured result");

    const merged = Array.from(new Set([...(photo.tags ?? []), ...(args.tags ?? [])]));

    const { error: upErr } = await supabase.from("photos").update({
      status: "done",
      diagnosis: args.diagnosis,
      confidence: args.confidence,
      severity: args.severity,
      affected_area: args.affected_area ?? null,
      explanation: args.explanation,
      alternatives: args.alternatives,
      treatment_plan: args.treatment_plan,
      tags: merged,
      raw_ai: data,
      updated_at: new Date().toISOString(),
    }).eq("id", photoId);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, result: args }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-photo error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      const { photoId } = await req.clone().json();
      if (photoId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.from("photos").update({ status: "error", explanation: msg }).eq("id", photoId);
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
