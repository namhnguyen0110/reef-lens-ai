import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Move, RefreshCw, Workflow, Wifi } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBridgeToken } from "@/lib/bridge.functions";

type Preset = { id: string; name: string; preset_number: number; area_id: string | null; settle_ms: number };
type Area = { id: string; name: string };
type Bridge = { id: string; name: string; token_hint: string | null; last_seen_at: string | null };

export function CameraPresetsPanel({ cameraId }: { cameraId: string }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mintToken = useServerFn(createBridgeToken);

  const load = async () => {
    const { data: p } = await supabase
      .from("camera_presets")
      .select("id,name,preset_number,area_id,settle_ms")
      .eq("camera_id", cameraId)
      .order("preset_number");
    setPresets((p as Preset[]) ?? []);
    const { data: a } = await supabase.from("areas").select("id,name").order("name");
    setAreas((a as Area[]) ?? []);
    const { data: b } = await supabase.from("bridge_devices").select("id,name,token_hint,last_seen_at").maybeSingle();
    setBridge((b as Bridge | null) ?? null);
  };

  useEffect(() => { load(); }, [cameraId]);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await mintToken({ data: { cameraId } });
      setToken(res.token);
      toast.success("Bridge token created — copy it now");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  };

  const patchPreset = async (id: string, patch: Partial<Preset>) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("camera_presets").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const online = bridge?.last_seen_at && Date.now() - new Date(bridge.last_seen_at).getTime() < 2 * 60 * 1000;

  return (
    <div className="mt-5 space-y-4">
      {/* Bridge setup */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Home bridge</p>
          {bridge && (
            <span className={`ml-auto text-[10px] rounded-full px-2 py-0.5 flex items-center gap-1 ${online ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              <Wifi className="h-3 w-3" /> {online ? "Online" : bridge.last_seen_at ? `Last seen ${new Date(bridge.last_seen_at).toLocaleString()}` : "Never connected"}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          PTZ presets need digest auth on your LAN, which a browser can't do. Run the small bridge script on a computer that stays on at home (see <code>bridge/README.md</code>) and paste this token into it.
        </p>
        {token && (
          <div className="mt-3 rounded-2xl bg-input border border-border p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Copy it now — it is shown only once.</p>
            <div className="flex items-center gap-2">
              <code className="text-[11px] break-all flex-1">{token}</code>
              <button onClick={() => { navigator.clipboard.writeText(token); toast.success("Copied"); }} className="h-8 w-8 rounded-xl glass flex items-center justify-center">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        <button onClick={generate} disabled={busy} className="mt-3 w-full gradient-reef rounded-2xl py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {bridge ? "Regenerate bridge token" : "Generate bridge token"}
        </button>
      </div>

      {/* Presets */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Move className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Camera presets</p>
          <button onClick={load} className="ml-auto h-8 w-8 rounded-xl glass flex items-center justify-center">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {presets.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            None imported yet. Start the bridge — it reads the presets saved on the camera and syncs them here automatically.
          </p>
        ) : (
          <div className="space-y-2.5">
            {presets.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] rounded-full bg-primary/15 text-primary px-2 py-0.5">#{p.preset_number}</span>
                  <input value={p.name} onChange={(e) => patchPreset(p.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-sm font-medium outline-none" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select value={p.area_id ?? ""} onChange={(e) => patchPreset(p.id, { area_id: e.target.value || null })}
                    className="bg-input border border-border rounded-xl px-2 py-1.5 text-[11px]">
                    <option value="">No area</option>
                    {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} value={p.settle_ms / 1000} onChange={(e) => patchPreset(p.id, { settle_ms: Number(e.target.value) * 1000 })}
                      className="w-full bg-input border border-border rounded-xl px-2 py-1.5 text-[11px]" />
                    <span className="text-[10px] text-muted-foreground">s settle</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/automations" className="glass rounded-2xl py-3 text-center text-sm font-medium flex items-center justify-center gap-2">
          <Workflow className="h-4 w-4" /> Automations
        </Link>
        <Link to="/areas" className="glass rounded-2xl py-3 text-center text-sm font-medium">
          Area folders
        </Link>
      </div>
    </div>
  );
}
