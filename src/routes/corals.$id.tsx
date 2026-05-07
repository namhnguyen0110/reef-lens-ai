import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Pencil, Plus, Trash2, GitCompare, TrendingUp, Check, X } from "lucide-react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/corals/$id")({
  component: CoralDetailPage,
  head: () => ({ meta: [{ title: "Coral growth — Reef Tank AI" }] }),
});

type Coral = { id: string; name: string; species: string | null; notes: string | null };
type Photo = {
  id: string; image_url: string; captured_at: string | null; created_at: string;
  diagnosis: string | null; severity: string | null;
};

function CoralDetailPage() {
  const { id } = useParams({ from: "/corals/$id" });
  const { session, loading } = useSession();
  const nav = useNavigate();
  const [coral, setCoral] = useState<Coral | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);

  const load = async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("corals").select("id,name,species,notes").eq("id", id).single(),
      supabase.from("photos").select("id,image_url,captured_at,created_at,diagnosis,severity")
        .eq("coral_id", id)
        .order("captured_at", { ascending: true, nullsFirst: false }),
    ]);
    setCoral(c as Coral | null);
    setPhotos((p ?? []) as Photo[]);
    if (c) setNameValue((c as Coral).name);
  };

  useEffect(() => { if (session) load(); }, [session, id]);

  const span = useMemo(() => {
    if (photos.length < 2) return null;
    const first = new Date(photos[0].captured_at ?? photos[0].created_at).getTime();
    const last = new Date(photos[photos.length - 1].captured_at ?? photos[photos.length - 1].created_at).getTime();
    const days = Math.max(1, Math.round((last - first) / 86400000));
    return days;
  }, [photos]);

  const saveDate = async (photoId: string) => {
    if (!dateValue) return;
    const iso = new Date(dateValue).toISOString();
    const { error } = await supabase.from("photos").update({ captured_at: iso }).eq("id", photoId);
    if (error) return toast.error(error.message);
    setEditingDate(null);
    toast.success("Date updated");
    load();
  };

  const removePhoto = async (photoId: string) => {
    if (!confirm("Remove this photo from the coral?")) return;
    const { error } = await supabase.from("photos").update({ coral_id: null }).eq("id", photoId);
    if (error) return toast.error(error.message);
    setPhotos(photos.filter(p => p.id !== photoId));
  };

  const saveName = async () => {
    if (!nameValue.trim() || !coral) return setEditingName(false);
    const { error } = await supabase.from("corals").update({ name: nameValue.trim() }).eq("id", coral.id);
    if (error) return toast.error(error.message);
    setCoral({ ...coral, name: nameValue.trim() });
    setEditingName(false);
  };

  const deleteCoral = async () => {
    if (!confirm("Delete this coral? Photos will be kept but ungrouped.")) return;
    await supabase.from("corals").delete().eq("id", id);
    toast.success("Coral deleted");
    nav({ to: "/corals" });
  };

  if (!coral) return <MobileShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></MobileShell>;

  const heroPhoto = photos[photos.length - 1];

  return (
    <MobileShell>
      <div className="relative">
        {/* Hero */}
        <div className="relative h-64 w-full overflow-hidden">
          {heroPhoto ? (
            <img src={heroPhoto.image_url} alt={coral.name} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 gradient-reef opacity-50" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background" />
          <Link to="/corals" className="absolute top-6 left-5 h-10 w-10 rounded-2xl glass-strong flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <button onClick={deleteCoral} className="absolute top-6 right-5 h-10 w-10 rounded-2xl glass-strong flex items-center justify-center">
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>

        <div className="px-5 -mt-12 relative pb-8">
          {/* Header card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-strong rounded-3xl p-5">
            {editingName ? (
              <div className="flex gap-2 items-center">
                <input value={nameValue} onChange={(e) => setNameValue(e.target.value)}
                  className="flex-1 bg-input border border-border rounded-xl px-3 py-2 text-lg font-bold" />
                <button onClick={saveName} className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight truncate">{coral.name}</h1>
                  {coral.species && <p className="text-xs text-muted-foreground mt-0.5">{coral.species}</p>}
                </div>
                <button onClick={() => setEditingName(true)} className="h-9 w-9 rounded-xl glass flex items-center justify-center flex-shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Photos" value={String(photos.length)} />
              <Stat label="Tracked" value={span ? `${span}d` : "—"} />
              <Stat label="Status" value={photos[photos.length-1]?.diagnosis ?? "—"} small />
            </div>
          </motion.div>

          {/* Add to coral CTA */}
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 w-full glass rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <Plus className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Add existing photo to this coral</p>
                <p className="text-xs text-muted-foreground">Group photos to track growth</p>
              </div>
            </div>
          </button>

          {photos.length >= 2 && (
            <Link to="/compare/$id" params={{ id: photos[photos.length - 1].id }}
              className="mt-3 w-full rounded-2xl p-4 gradient-reef flex items-center justify-between active:scale-[0.99] transition">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/20 text-primary-foreground flex items-center justify-center">
                  <GitCompare className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-primary-foreground">Compare growth</p>
                  <p className="text-xs text-primary-foreground/80">First vs latest photo</p>
                </div>
              </div>
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </Link>
          )}

          {/* Timeline */}
          <h2 className="text-lg font-semibold mt-7 mb-3">Growth timeline</h2>

          {photos.length === 0 ? (
            <div className="glass rounded-3xl p-8 text-center">
              <p className="text-sm text-muted-foreground">No photos for this coral yet.</p>
              <button onClick={() => setShowAdd(true)} className="mt-3 gradient-reef rounded-2xl px-4 py-2 text-sm font-semibold text-primary-foreground">
                Add a photo
              </button>
            </div>
          ) : (
            <div className="relative pl-2">
              {/* vertical rail */}
              <div className="absolute left-[78px] top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-primary/70 via-primary/40 to-primary/10" />
              <div className="space-y-4">
                {photos.map((p, i) => {
                  const date = new Date(p.captured_at ?? p.created_at);
                  const isEditing = editingDate === p.id;
                  const prevDate = i > 0 ? new Date(photos[i-1].captured_at ?? photos[i-1].created_at) : null;
                  const daysSince = prevDate ? Math.max(1, Math.round((date.getTime() - prevDate.getTime()) / 86400000)) : null;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="relative grid grid-cols-[68px_1fr] gap-5 items-start"
                    >
                      {/* Left date column */}
                      <div className="text-right pt-1">
                        <div className="inline-flex flex-col items-center glass-strong rounded-2xl px-2.5 py-2 min-w-[60px]">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-primary font-bold">
                            {date.toLocaleDateString(undefined, { month: "short" })}
                          </p>
                          <p className="text-xl font-bold leading-none mt-0.5">
                            {date.getDate()}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            {date.getFullYear()}
                          </p>
                        </div>
                        {daysSince && (
                          <p className="text-[10px] text-primary font-semibold mt-1.5">
                            +{daysSince}d
                          </p>
                        )}
                      </div>

                      {/* Dot on rail */}
                      <div className="absolute left-[72px] top-5 h-3.5 w-3.5 rounded-full bg-primary ring-[3px] ring-background shadow-[0_0_0_2px_hsl(var(--primary)/0.35),0_0_14px_hsl(var(--primary)/0.7)]" />

                      {/* Right photo card */}
                      <div className="glass rounded-2xl overflow-hidden">
                        <Link to="/photo/$id" params={{ id: p.id }} className="block aspect-[5/3] relative">
                          <img src={p.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <span className="absolute top-2 left-2 text-[10px] bg-background/70 backdrop-blur px-2 py-0.5 rounded-full font-semibold">
                            #{i + 1}
                          </span>
                          {p.severity && p.severity !== "None" && (
                            <span className="absolute top-2 right-2 text-[10px] bg-accent/90 text-accent-foreground px-2 py-0.5 rounded-full font-semibold">
                              {p.severity}
                            </span>
                          )}
                        </Link>
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 flex-1">
                                <input
                                  type="date"
                                  value={dateValue}
                                  onChange={(e) => setDateValue(e.target.value)}
                                  className="flex-1 bg-input border border-border rounded-lg px-2 py-1 text-xs"
                                />
                                <button onClick={() => saveDate(p.id)} className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                                  <Check className="h-3 w-3" />
                                </button>
                                <button onClick={() => setEditingDate(null)} className="h-7 w-7 rounded-lg glass flex items-center justify-center">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingDate(p.id);
                                  setDateValue(date.toISOString().slice(0, 10));
                                }}
                                className="flex items-center gap-1.5 text-xs font-semibold text-primary"
                              >
                                <Calendar className="h-3 w-3" />
                                Edit date
                                <Pencil className="h-2.5 w-2.5 opacity-60" />
                              </button>
                            )}
                            <button onClick={() => removePhoto(p.id)} className="text-xs text-muted-foreground p-1">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          {p.diagnosis && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{p.diagnosis}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddPhotoSheet coralId={id} onClose={() => { setShowAdd(false); load(); }} />}
    </MobileShell>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="glass rounded-2xl p-2.5 text-center">
      <p className={`font-bold ${small ? "text-sm" : "text-lg"} truncate`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

function AddPhotoSheet({ coralId, onClose }: { coralId: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<{ id: string; image_url: string; captured_at: string | null; created_at: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("photos").select("id,image_url,captured_at,created_at")
      .is("coral_id", null)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => setPhotos(data ?? []));
  }, []);

  const togglePick = (id: string) => {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  };

  const save = async () => {
    if (picked.size === 0) return onClose();
    const ids = Array.from(picked);
    const { error } = await supabase.from("photos").update({ coral_id: coralId }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Added ${ids.length} photo${ids.length > 1 ? "s" : ""}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        className="w-full md:w-[420px] max-h-[80vh] bg-background rounded-t-[2rem] md:rounded-[2rem] border border-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Add to coral</h3>
            <p className="text-xs text-muted-foreground">{picked.size} selected</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl glass flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {photos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No ungrouped photos. Capture some first!</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map(p => {
                const on = picked.has(p.id);
                return (
                  <button key={p.id} onClick={() => togglePick(p.id)}
                    className={`relative aspect-square rounded-2xl overflow-hidden ring-2 transition ${on ? "ring-primary" : "ring-transparent"}`}>
                    <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                    {on && (
                      <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                        <Check className="h-6 w-6 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border">
          <button onClick={save} className="w-full gradient-reef rounded-2xl py-3.5 font-semibold text-primary-foreground glow-aqua">
            Add {picked.size > 0 ? `${picked.size} photo${picked.size > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
