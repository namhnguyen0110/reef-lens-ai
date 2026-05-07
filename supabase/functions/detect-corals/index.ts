// Detect coral candidates in a photo and return normalized bounding boxes.
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
      .from("photos").select("id,image_url").eq("id", photoId).single();
    if (error || !photo) throw new Error(error?.message ?? "photo not found");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const tools = [{
      type: "function",
      function: {
        name: "report_corals",
        description: "Return individual coral candidates visible in the photo with normalized bounding boxes.",
        parameters: {
          type: "object",
          properties: {
            corals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Suggested coral common name (e.g. Torch coral, Acropora, Zoanthid)." },
                  species: { type: "string", description: "Best-guess species or trade name if recognizable, else empty string." },
                  confidence: { type: "number", description: "0-100 confidence this region is a distinct coral." },
                  tags: { type: "array", items: { type: "string" }, description: "1-4 short descriptors (color, morph, condition)." },
                  box: {
                    type: "object",
                    description: "Normalized bounding box, all values 0-1 relative to image width/height.",
                    properties: {
                      x: { type: "number" }, y: { type: "number" },
                      w: { type: "number" }, h: { type: "number" },
                    },
                    required: ["x", "y", "w", "h"],
                  },
                },
                required: ["label", "confidence", "box", "tags"],
              },
            },
          },
          required: ["corals"],
        },
      },
    }];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "You are a reef-tank vision assistant. Identify each visually distinct coral colony in the photo and return a tight normalized bounding box for each. Skip fish, rockwork without coral, equipment, and background. If two coral heads are clearly separate colonies, return them as separate entries. Boxes use top-left origin, values 0-1 relative to the full image. Aim for tight crops (small padding). If no corals are visible, return an empty array.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Detect every distinct coral colony. Return tight bounding boxes." },
              { type: "image_url", image_url: { url: photo.image_url } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "report_corals" } },
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
    const args = call ? JSON.parse(call.function.arguments) : { corals: [] };

    // Clamp boxes
    const corals = (args.corals ?? []).map((c: any) => ({
      ...c,
      box: {
        x: Math.max(0, Math.min(1, c.box?.x ?? 0)),
        y: Math.max(0, Math.min(1, c.box?.y ?? 0)),
        w: Math.max(0.02, Math.min(1, c.box?.w ?? 0.2)),
        h: Math.max(0.02, Math.min(1, c.box?.h ?? 0.2)),
      },
    }));

    return new Response(JSON.stringify({ ok: true, corals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-corals error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
