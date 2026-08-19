import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Creates (or rotates) the pairing token for the user's LAN bridge. */
export const createBridgeToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cameraId?: string | null; name?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { sha256Hex } = await import("@/lib/bridge-auth.server");
    const raw = `rbr_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const hash = await sha256Hex(raw);

    const { supabase, userId } = context;
    // One bridge per user for now — replace the previous token.
    await supabase.from("bridge_devices").delete().eq("user_id", userId);
    const { error } = await supabase.from("bridge_devices").insert({
      user_id: userId,
      name: data.name?.slice(0, 60) || "Home bridge",
      camera_id: data.cameraId ?? null,
      token_hash: hash,
      token_hint: `${raw.slice(0, 8)}…${raw.slice(-4)}`,
    });
    if (error) throw new Error(error.message);
    return { token: raw };
  });
