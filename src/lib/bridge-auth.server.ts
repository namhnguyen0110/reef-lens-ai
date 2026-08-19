// Server-only helpers for authenticating the always-on LAN bridge.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type BridgeDevice = {
  id: string;
  user_id: string;
  name: string;
  camera_id: string | null;
};

export type BridgeAuth = {
  device: BridgeDevice;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>;
};

/**
 * Verifies the `Authorization: Bearer <bridge token>` header.
 * Returns null when the token is missing or unknown.
 */
export async function authenticateBridge(request: Request): Promise<BridgeAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256Hex(token);
  const { data } = await supabaseAdmin
    .from("bridge_devices")
    .select("id,user_id,name,camera_id")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) return null;

  await supabaseAdmin
    .from("bridge_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return { device: data as BridgeDevice, admin: supabaseAdmin };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
