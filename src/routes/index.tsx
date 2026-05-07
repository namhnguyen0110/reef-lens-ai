import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Image as ImageIcon, Plus, LogOut, Sparkles, Activity } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Reef Tank AI — Diagnose your reef in seconds" },
      { name: "description", content: "Snap a photo, get instant AI diagnosis, treatment plan, and history for your reef tank." },
    ],
  }),
});

type Tank = { id: string; name: string; description: string | null };
type Photo = { id: string; image_url: string; diagnosis: string | null; severity: string | null; status: string; created_at: string };

function Index() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [recent, setRecent] = useState<Photo[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !session) nav({ to: "/auth" });
  }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("tanks").select("id,name,description").order("created_at", { ascending: false }),
        supabase.from("photos").select("id,image_url,diagnosis,severity,status,created_at").order("created_at", { ascending: false }).limit(6),
      ]);
      setTanks(t ?? []);
      setRecent(p ?? []);
    })();
  }, [session]);

  const createTank = async () => {
    const name = prompt("Tank name", "Main Reef Tank");
    if (!name) return;
    setCreating(true);
    const { data, error } = await supabase.from("tanks").insert({ name, user_id: session!.user.id }).select().single();
    setCreating(false);
    if (error) return toast.error(error.message);
    setTanks([data as Tank, ...tanks]);
  };

  if (loading || !session) return null;

  const totalDiagnosed = recent.filter((r) => r.status === "done").length;
  const issues = recent.filter((r) => r.diagnosis && r.diagnosis !== "Healthy").length;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-muted-foreground">Welcome back</p>
            <h1 className="text-2xl font-bold tracking-tight">{session.user.email?.split("@")[0]}</h1>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}
            className="h-10 w-10 rounded-2xl glass flex items-center justify-center"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Hero card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative overflow-hidden rounded-3xl p-6 gradient-reef glow-aqua">
            <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
            <Sparkles className="h-6 w-6 text-primary-foreground/80 mb-3" />
            <h2 className="text-2xl font-bold text-primary-foreground leading-tight">
              Snap. Diagnose.<br />Heal your reef.
            </h2>
            <p className="text-sm text-primary-foreground/80 mt-2 max-w-[18ch]">AI-powered reef health in seconds.</p>
            <Link
              to="/capture"
              className="mt-5 inline-flex items-center gap-2 bg-background/95 text-foreground rounded-2xl px-4 py-2.5 text-sm font-semibold"
            >
              <Camera className="h-4 w-4" /> New analysis
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <StatCard icon={<Activity className="h-4 w-4" />} label="Analyses" value={String(totalDiagnosed)} />
          <StatCard icon={<Sparkles className="h-4 w-4" />} label="Issues spotted" value={String(issues)} accent />
        </div>

        {/* Tanks */}
        <div className="mt-7">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">My Tanks</h3>
            <button onClick={createTank} disabled={creating} className="text-xs text-primary flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add tank
            </button>
          </div>
          {tanks.length === 0 ? (
            <button onClick={createTank} className="w-full glass rounded-3xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No tanks yet — tap to create your first.</p>
            </button>
          ) : (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-2">
              {tanks.map((t) => (
                <div key={t.id} className="glass rounded-3xl p-4 min-w-[180px]">
                  <div className="h-10 w-10 rounded-2xl gradient-reef mb-3" />
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{t.description ?? "Reef setup"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent */}
        <div className="mt-7">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Recent analyses</h3>
            <Link to="/timeline" className="text-xs text-primary">View all</Link>
          </div>
          {recent.length === 0 ? (
            <div className="glass rounded-3xl p-6 text-center">
              <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No photos yet. Capture your first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {recent.map((p) => (
                <Link key={p.id} to="/photo/$id" params={{ id: p.id }} className="relative aspect-square rounded-2xl overflow-hidden group">
                  <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-1 left-1.5 right-1.5">
                    <p className="text-[10px] font-medium text-white line-clamp-1">
                      {p.status === "done" ? p.diagnosis : p.status === "analyzing" ? "Analyzing…" : "Pending"}
                    </p>
                  </div>
                  {p.severity && p.severity !== "None" && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className={`h-8 w-8 rounded-xl flex items-center justify-center mb-2 ${accent ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
