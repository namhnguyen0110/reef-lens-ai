import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Video, Wifi, WifiOff, ChevronRight, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { mockLiveUrl } from "@/lib/mock-camera";

export const Route = createFileRoute("/cameras/")({
  component: CamerasPage,
  head: () => ({ meta: [{ title: "Camera AI — Reef Tank AI" }] }),
});

type Camera = {
  id: string;
  name: string;
  brand: string;
  status: string;
  mock_seed: number;
  tank_id: string | null;
  snapshot_interval_minutes: number;
  last_snapshot_at: string | null;
};

function CamerasPage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [cameras, setCameras] = useState<Camera[]>([]);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    supabase.from("cameras")
      .select("id,name,brand,status,mock_seed,tank_id,snapshot_interval_minutes,last_snapshot_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setCameras(data ?? []));
  }, [session]);

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <button onClick={() => nav({ to: "/" })} className="h-10 w-10 rounded-2xl glass flex items-center justify-center mb-4">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Camera <span className="text-gradient-reef">AI</span></h1>
            <p className="text-sm text-muted-foreground mt-1">Live view, scheduled snapshots, change detection.</p>
          </div>
          <Link to="/cameras/new" className="h-11 w-11 rounded-2xl gradient-reef text-primary-foreground flex items-center justify-center glow-aqua">
            <Plus className="h-5 w-5" />
          </Link>
        </div>

        {cameras.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8 glass rounded-3xl p-8 text-center">
            <div className="h-14 w-14 mx-auto rounded-2xl gradient-reef flex items-center justify-center mb-3">
              <Video className="h-6 w-6 text-primary-foreground" />
            </div>
            <p className="font-semibold">No cameras yet</p>
            <p className="text-sm text-muted-foreground mt-1">Connect your existing webcam or IP camera.</p>
            <Link to="/cameras/new" className="mt-5 gradient-reef rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add your first camera
            </Link>
          </motion.div>
        ) : (
          <div className="mt-6 space-y-3">
            {cameras.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to="/cameras/$id" params={{ id: c.id }} className="block glass rounded-3xl overflow-hidden active:scale-[0.99] transition">
                  <div className="relative aspect-[16/9]">
                    <img src={mockLiveUrl(c.mock_seed)} alt={c.name} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 glass-strong rounded-full px-2.5 py-1 text-[10px] font-medium">
                      {c.status === "online" ? (
                        <><Wifi className="h-3 w-3 text-success" /> Live</>
                      ) : (
                        <><WifiOff className="h-3 w-3 text-destructive" /> Offline</>
                      )}
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                      <div>
                        <p className="font-semibold text-white">{c.name}</p>
                        <p className="text-[11px] text-white/70 capitalize">{c.brand} · every {c.snapshot_interval_minutes} min</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/80" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
