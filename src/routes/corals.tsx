import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Shell, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/corals")({
  component: CoralsPage,
  head: () => ({ meta: [{ title: "Corals — Reef Tank AI" }] }),
});

type Coral = {
  id: string;
  name: string;
  species: string | null;
  cover_photo_id: string | null;
  cover_url?: string | null;
  photo_count?: number;
  latest?: string | null;
};

function CoralsPage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [corals, setCorals] = useState<Coral[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const { data: c } = await supabase
      .from("corals")
      .select("id,name,species,cover_photo_id")
      .order("created_at", { ascending: false });
    if (!c) return setCorals([]);
    // Hydrate cover urls + photo counts
    const enriched = await Promise.all(
      c.map(async (coral) => {
        const { data: photos } = await supabase
          .from("photos")
          .select("id,image_url,captured_at")
          .eq("coral_id", coral.id)
          .order("captured_at", { ascending: false })
          .limit(1);
        const cover = photos?.[0];
        const { count } = await supabase
          .from("photos")
          .select("id", { count: "exact", head: true })
          .eq("coral_id", coral.id);
        return {
          ...coral,
          cover_url: cover?.image_url ?? null,
          photo_count: count ?? 0,
          latest: cover?.captured_at ?? null,
        } as Coral;
      })
    );
    setCorals(enriched);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const createCoral = async () => {
    const name = prompt("Coral name", "Torch coral");
    if (!name) return;
    const species = prompt("Species (optional)", "") || null;
    setBusy(true);
    const { data, error } = await supabase
      .from("corals")
      .insert({ name, species, user_id: session!.user.id })
      .select()
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Coral created");
    setCorals([{ ...(data as Coral), photo_count: 0 }, ...corals]);
  };

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Corals</h1>
            <p className="text-sm text-muted-foreground mt-1">Track each coral's growth over time.</p>
          </div>
          <button
            onClick={createCoral}
            disabled={busy}
            className="h-11 w-11 rounded-2xl gradient-reef text-primary-foreground flex items-center justify-center glow-aqua"
            aria-label="Add coral"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {corals.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="mt-8 glass rounded-3xl p-8 text-center">
            <div className="h-14 w-14 mx-auto rounded-2xl gradient-reef flex items-center justify-center mb-3">
              <Shell className="h-6 w-6 text-primary-foreground" />
            </div>
            <p className="font-semibold">No corals yet</p>
            <p className="text-sm text-muted-foreground mt-1">Group your photos to track each coral's growth.</p>
            <button onClick={createCoral} className="mt-5 gradient-reef rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Create your first coral
            </button>
          </motion.div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {corals.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to="/corals/$id" params={{ id: c.id }}
                  className="block relative aspect-[3/4] rounded-3xl overflow-hidden glass active:scale-[0.98] transition">
                  {c.cover_url ? (
                    <img src={c.cover_url} alt={c.name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 gradient-reef opacity-60" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute top-2.5 right-2.5 glass-strong rounded-full px-2 py-0.5 text-[10px] font-medium">
                    {c.photo_count ?? 0} 📸
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="font-semibold text-white text-sm leading-tight line-clamp-1">{c.name}</p>
                    {c.species && <p className="text-[10px] text-white/70 line-clamp-1">{c.species}</p>}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-white/60">
                        {c.latest ? new Date(c.latest).toLocaleDateString() : "No photos"}
                      </span>
                      <ChevronRight className="h-3 w-3 text-white/70" />
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
