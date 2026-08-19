import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Pencil, Check } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/areas/$id")({
  component: AreaDetail,
  head: () => ({
    meta: [
      { title: "Area timeline — Reef Tank AI" },
      { name: "description", content: "Every automated snapshot captured for this tank area, newest first." },
      { property: "og:title", content: "Area timeline — Reef Tank AI" },
      { property: "og:description", content: "Track one part of your reef tank over time with scheduled camera snapshots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Photo = { id: string; image_url: string; captured_at: string | null; burst_group_id: string | null };

function AreaDetail() {
  const { id } = useParams({ from: "/areas/$id" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [area, setArea] = useState<{ id: string; name: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const { data: a } = await supabase.from("areas").select("id,name").eq("id", id).maybeSingle();
    setArea(a as { id: string; name: string } | null);
    setDraftName(a?.name ?? "");
    const { data: p } = await supabase
      .from("photos")
      .select("id,image_url,captured_at,burst_group_id")
      .eq("area_id", id)
      .order("captured_at", { ascending: false })
      .limit(200);
    setPhotos((p as Photo[]) ?? []);
  };

  useEffect(() => { if (session) load(); }, [session, id]);

  const rename = async () => {
    if (!draftName.trim()) return;
    const { error } = await supabase.from("areas").update({ name: draftName.trim() }).eq("id", id);
    if (error) return toast.error(error.message);
    setRenaming(false);
    setArea((a) => (a ? { ...a, name: draftName.trim() } : a));
  };

  const remove = async () => {
    const { error } = await supabase.from("areas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Area deleted");
    nav({ to: "/areas" });
  };

  if (loading || !session || !area) return null;

  // Group bursts so a 10-frame burst reads as one entry.
  const groups: { key: string; photos: Photo[] }[] = [];
  for (const p of photos) {
    const key = p.burst_group_id ?? p.id;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.photos.push(p);
    else groups.push({ key, photos: [p] });
  }

  return (
    <MobileShell>
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => nav({ to: "/areas" })} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => (renaming ? rename() : setRenaming(true))} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
              {renaming ? <Check className="h-4 w-4 text-success" /> : <Pencil className="h-4 w-4" />}
            </button>
            <button onClick={remove} className="h-10 w-10 rounded-2xl glass flex items-center justify-center">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        </div>

        {renaming ? (
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-xl font-bold" />
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">{area.name}</h1>
        )}
        <p className="text-xs text-muted-foreground mt-1">{photos.length} snapshot{photos.length === 1 ? "" : "s"}</p>

        <div className="mt-5 space-y-4">
          {groups.length === 0 && (
            <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
              Nothing here yet. Run an automation that saves to this area.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="glass rounded-3xl p-3">
              <p className="text-[11px] text-muted-foreground px-1 pb-2">
                {g.photos[0].captured_at ? new Date(g.photos[0].captured_at).toLocaleString() : "—"}
                {g.photos.length > 1 && ` · ${g.photos.length}-frame burst`}
              </p>
              <div className={g.photos.length > 1 ? "grid grid-cols-4 gap-1.5" : ""}>
                {g.photos.slice(0, 8).map((p) => (
                  <Link key={p.id} to="/photo/$id" params={{ id: p.id }} className={`block overflow-hidden rounded-2xl ${g.photos.length > 1 ? "aspect-square" : "aspect-[5/3]"}`}>
                    <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
