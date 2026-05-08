import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Wifi, Check } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { CAMERA_BRANDS } from "@/lib/mock-camera";
import { toast } from "sonner";

export const Route = createFileRoute("/cameras/new")({
  component: NewCameraPage,
  head: () => ({ meta: [{ title: "Add Camera — Reef Tank AI" }] }),
});

type Tank = { id: string; name: string };

function NewCameraPage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [step, setStep] = useState<"brand" | "creds" | "testing" | "success">("brand");
  const [brand, setBrand] = useState<string>("mock");
  const [name, setName] = useState("Reef Cam");
  const [url, setUrl] = useState("");
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [tankId, setTankId] = useState<string>("");

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  useEffect(() => {
    if (!session) return;
    supabase.from("tanks").select("id,name").then(({ data }) => {
      setTanks(data ?? []);
      if (data?.[0]) setTankId(data[0].id);
    });
  }, [session]);

  const test = async () => {
    setStep("testing");
    // Simulate connection test.
    await new Promise((r) => setTimeout(r, 1400));
    const seed = Math.floor(Math.random() * 1000);
    const { data, error } = await supabase.from("cameras").insert({
      user_id: session!.user.id,
      tank_id: tankId || null,
      name,
      brand,
      connection_type: brand === "rtsp" ? "rtsp" : "mock",
      connection_url: url || null,
      mock_seed: seed,
      status: "online",
    }).select().single();
    if (error) { toast.error(error.message); setStep("creds"); return; }
    setStep("success");
    setTimeout(() => nav({ to: "/cameras/$id", params: { id: data.id } }), 900);
  };

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <button onClick={() => (step === "brand" ? nav({ to: "/cameras" }) : setStep("brand"))} className="h-10 w-10 rounded-2xl glass flex items-center justify-center mb-4">
          <ArrowLeft className="h-4 w-4" />
        </button>

        {step === "brand" && (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Add a camera</h1>
            <p className="text-sm text-muted-foreground mt-1">Pick your brand or use a generic stream.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {CAMERA_BRANDS.map((b) => (
                <button key={b.id} onClick={() => { setBrand(b.id); setStep("creds"); }}
                  className={`glass rounded-3xl p-5 text-left transition ${brand === b.id ? "ring-2 ring-primary" : ""}`}>
                  <Wifi className="h-5 w-5 text-primary mb-2" />
                  <p className="font-semibold text-sm">{b.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {b.id === "rtsp" ? "rtsp:// or onvif://" : b.id === "mock" ? "Demo feed for testing" : "App pairing"}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "creds" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Camera details</h1>
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm" />
              </div>
              {brand === "rtsp" ? (
                <div>
                  <label className="text-xs text-muted-foreground">Stream URL</label>
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="rtsp://user:pass@192.168.1.50/stream"
                    className="mt-1 w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm" />
                </div>
              ) : brand !== "mock" && (
                <div className="glass rounded-2xl p-3 text-xs text-muted-foreground">
                  We'll pair via the {CAMERA_BRANDS.find(b => b.id === brand)?.label} cloud — no extra fields needed for the demo.
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Assign to tank</label>
                <select value={tankId} onChange={(e) => setTankId(e.target.value)}
                  className="mt-1 w-full bg-input border border-border rounded-2xl px-3 py-3 text-sm">
                  <option value="">— None —</option>
                  {tanks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <button onClick={test} className="mt-6 w-full gradient-reef rounded-2xl py-4 font-semibold text-primary-foreground glow-aqua">
              Test connection
            </button>
          </>
        )}

        {step === "testing" && (
          <div className="py-24 flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Connecting to camera…</p>
          </div>
        )}

        {step === "success" && (
          <div className="py-24 flex flex-col items-center">
            <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="h-7 w-7 text-success" />
            </div>
            <p className="mt-4 font-semibold">Camera connected</p>
            <p className="text-sm text-muted-foreground">Opening live view…</p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
