import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, FolderOpen, ChevronRight, Workflow } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/areas/")({
  component: AreasPage,
  head: () => ({
    meta: [
      { title: "Tank areas — Reef Tank AI" },
      { name: "description", content: "Folders for each part of your reef tank — skimmer, SPS rack, LPS, lighting — with their own snapshot timelines." },
      { property: "og:title", content: "Tank areas — Reef Tank AI" },
      { property: "og:description", content: "Organise camera snapshots by tank area and track each one over time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Area = { id: string; name: string; description: string | null; count?: number; cover?: string | null };

function AreasPage() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const { data } = await supabase.from("areas").select("id,name,description").order("created_at", { ascending: true });
    const list = (data as Area[]) ?? [];
    const enriched = await Promise.all(
      list.map(async (a) => {
        const { data: photos, count } = await supabase
          .from("photos")
          .select("image_url", { count: "exact" })
          .eq("area_id", a.id)
          .order("captured_at", { ascending: false })
          .limit(1);
        return { ...a, count: count ?? 0, cover: photos?.[0]?.image_url ?? null };
      }),
    );
    setAreas(enriched);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const create = async () => {
    if (!session || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("areas").insert({ user_id: session.user.id, name: name.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setName("");
    toast.success("Area created");
    load();
  };

  if (loading || !session) return null;

  return (
    <MobileShell>
      <div className="px-5 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Areas</h1>
            <p className="text-sm text-muted-foreground mt-1">Folders for skimmer, SPS, LPS, lighting…</p>
          </div>
          <Link to="/automations" className="glass rounded-2xl px-3 py-2 text-xs flex items-center gap-1.5">
            <Workflow className="h-3.5 w-3.5" /> Automations
          </Link>
        </div>

        <div className="mt-5 glass rounded-3xl p-3 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New area name (e.g. Skimmer)"
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
          />
          <button onClick={create} disabled={busy || !name.trim()} className="gradient-reef rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {areas.length === 0 && (
            <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
              No areas yet. Create one, then link it to a camera preset.
            </div>
          )}
          {areas.map((a) => (
            <Link key={a.id} to="/areas/$id" params={{ id: a.id }} className="glass rounded-3xl p-3 flex items-center gap-3">
              <div className="h-16 w-16 rounded-2xl overflow-hidden bg-muted/30 flex items-center justify-center shrink-0">
                {a.cover ? <img src={a.cover} alt={a.name} className="h-full w-full object-cover" /> : <FolderOpen className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.count} snapshot{a.count === 1 ? "" : "s"}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
