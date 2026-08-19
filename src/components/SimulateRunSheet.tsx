import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ImagePlus, Loader2, Play, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { SAMPLE_IMAGES } from "@/lib/demo-seed";
import { fetchSampleBlob, simulateWorkflow, type SimProgress } from "@/lib/simulate-run";
import { STEP_META, type StepType, type WorkflowStep } from "@/lib/workflow-steps";

type Preset = { id: string; name: string; preset_number: number; area_id: string | null };

export function SimulateRunSheet({
  open, onClose, userId, workflowId, cameraId, steps, presets,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  workflowId: string;
  cameraId: string | null;
  steps: WorkflowStep[];
  presets: Preset[];
}) {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sample, setSample] = useState(SAMPLE_IMAGES[0].url);
  const [upload, setUpload] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<SimProgress[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  if (!open) return null;

  const previewUrl = upload ? URL.createObjectURL(upload) : sample;

  const start = async () => {
    if (!steps.length) return toast.error("Add some steps first");
    setRunning(true);
    setLog([]);
    setRunId(null);
    try {
      const image = upload ?? (await fetchSampleBlob(sample));
      const res = await simulateWorkflow({
        userId, workflowId, cameraId, steps, image, presets,
        onProgress: (p) =>
          setLog((prev) => {
            const next = prev.filter((x) => x.position !== p.position);
            return [...next, p].sort((a, b) => a.position - b.position);
          }),
      });
      setRunId(res.runId);
      toast.success("Simulated run finished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm">
      <div className="w-full max-w-md glass rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold">Simulate run (no bridge)</p>
          <button onClick={onClose} className="h-8 w-8 rounded-xl glass flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Runs every step in the app using a sample image instead of the camera, so you can test capture → area folder → AI compare.
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {SAMPLE_IMAGES.map((s) => (
            <button key={s.url} onClick={() => { setUpload(null); setSample(s.url); }}
              className={`rounded-2xl overflow-hidden border-2 transition ${!upload && sample === s.url ? "border-primary" : "border-transparent"}`}>
              <img src={s.url} alt={s.label} className="h-16 w-full object-cover" />
            </button>
          ))}
        </div>
        <button onClick={() => fileRef.current?.click()}
          className={`mt-2 w-full rounded-2xl border py-2.5 text-xs flex items-center justify-center gap-2 ${upload ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
          <ImagePlus className="h-3.5 w-3.5" /> {upload ? upload.name : "Upload my own image"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />

        <img src={previewUrl} alt="Sample frame used for the simulated capture" className="mt-3 w-full h-36 object-cover rounded-2xl" />

        <button onClick={start} disabled={running}
          className="mt-4 w-full gradient-reef rounded-2xl py-3.5 font-semibold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Running steps…" : "Start simulated run"}
        </button>

        {log.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {log.map((l) => (
              <div key={l.position} className="flex items-start gap-2 text-[11px]">
                {l.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5" />
                  : l.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5" />
                  : <Loader2 className="h-3.5 w-3.5 text-primary animate-spin mt-0.5" />}
                <div className="min-w-0">
                  <p className="font-medium">{l.position + 1}. {STEP_META[l.label as StepType]?.label ?? l.label}</p>
                  {l.detail && <p className="text-muted-foreground">{l.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {runId && (
          <button onClick={() => nav({ to: "/automations/$id/runs", params: { id: workflowId } })}
            className="mt-4 w-full glass rounded-2xl py-3 text-sm font-medium">
            Open run history
          </button>
        )}
      </div>
    </div>
  );
}
