# PTZ Presets + Drag-and-Drop Capture Automations

Yes, this is feasible. Dahua cameras expose PTZ presets over their HTTP CGI API, so the app can read your preset list, move the camera to a preset, wait for it to settle, and grab a snapshot — all without any Dahua SDK.

The one hard constraint: those calls need digest auth against the camera on your LAN, which a browser tab on a cloud-hosted https site cannot do. So the automations are executed by an **always-on LAN bridge** (a small script you run on a Mac mini / Raspberry Pi on the same network). The app is the brain: you build the workflow, the bridge polls for work and does the camera driving + uploads.

```text
Phone / laptop browser        Cloud (this app)              Your LAN
  build workflow      ->   workflows + steps table   <->   bridge script
  view results        <-   photos + areas + AI              |  HTTP CGI
                                                            v
                                                        Dahua camera
```

## What you'll be able to do

**1. Import presets**
Point the bridge at the camera once; it reads the camera's preset list (names + numbers) and syncs them into the app. Presets show up as a pickable list: "Skimmer", "SPS rack", "Wavemaker", etc.

**2. Areas (folders)**
A new "Areas" concept, separate from Corals. Each area (Skimmer, LPS, SPS, Light) is a folder with its own photo timeline. A preset can be linked to an area so captures file themselves automatically.

**3. Drag-and-drop workflow builder**
A vertical step list you reorder by dragging. Step types:
- **Go to preset** — pick a preset; the bridge pans/zooms and waits for settle (configurable, default 3s)
- **Capture** — photo, or a burst (N frames over ~5s) stored as one sequence
- **Save to area** — pick the destination folder; timestamp metadata is written on every frame
- **Wait** — delay in seconds/minutes before the next step
- **AI compare** — pick an area and lookback offsets (5 min / 1 h / 1 day / custom); the app pulls the nearest photo to each offset and sends the set to the existing compare-photos AI

Each workflow has its own trigger: a daily time (e.g. 10:00), a repeating interval, or manual "Run now". Multiple workflows can exist with different schedules.

**4. Run history**
Every run is logged with per-step status, so you can see exactly what fired, what the camera returned, and open the resulting photos and AI comparison.

## What you do on your side

1. Run the bridge script on a machine that stays on at home (one command, needs Node).
2. Paste a pairing token from the app into the bridge's config, plus camera IP + login.
3. Everything else — presets, workflows, schedules — you do in the app.

No port forwarding needed for this: the bridge reaches out to the cloud, the cloud never reaches into your LAN.

## Honest limits

- If the bridge machine is off, scheduled runs don't fire (they're marked skipped, not lost).
- The "5-second video" is a photo burst (~10 frames over 5s) rather than an MP4, per your choice. It plays back as a flipbook and the AI analyses the sharpest frames.
- Preset naming comes from whatever you saved on the camera; you can rename inside the app without touching the camera.

---

## Technical section

**Schema (migration, all with GRANTs + RLS scoped to `auth.uid()`):**
- `camera_presets` — camera_id, preset_number, name, area_id, settle_ms
- `areas` — name, tank_id, cover_photo_id
- `workflows` — name, camera_id, trigger_type (`daily` | `interval` | `manual`), trigger_time, interval_minutes, enabled, last_run_at
- `workflow_steps` — workflow_id, position, type, config jsonb
- `workflow_runs` + `workflow_run_steps` — status, started/finished, error
- `bridge_devices` — pairing token hash, last_seen_at, camera bindings
- `photos` gains `area_id` and `burst_group_id`

**Bridge protocol** (TanStack server routes under `src/routes/api/public/bridge/*`, bearer token = bridge device token, verified in-handler):
- `POST /claim` — bridge polls; returns at most one due run with its resolved steps (single-flight lease row with expiry so two bridges can't double-run)
- `POST /presets` — bridge pushes the camera's preset list for sync
- `POST /ingest` — multipart upload of a captured frame; server writes storage + `photos` row with `area_id`, `captured_at`, `workflow_run_id`
- `POST /step` — per-step status/error reporting

**Bridge script** (`bridge/reef-bridge.mjs`, plain Node, no native deps):
- `GET /cgi-bin/ptz.cgi?action=getPresets&channel=1` → parse preset table
- `GET /cgi-bin/ptz.cgi?action=start&channel=1&code=GotoPreset&arg1=0&arg2=<n>&arg3=0`
- `GET /cgi-bin/snapshot.cgi?channel=1` → JPEG bytes
- HTTP digest auth implemented inline; bounded batch per poll, exponential backoff, resumes cleanly after restart

**Scheduling:** pg_cron marks workflows due (`next_run_at`) every minute; the bridge claims due runs. Runs are idempotent by `(workflow_id, scheduled_for)`.

**AI compare step:** reuses the existing `compare-photos` function; the step resolves each lookback offset to the nearest photo in the target area and stores the result in `comparisons`, linked to the run.

**UI (new routes):**
- `/areas`, `/areas/$id` — folders and their timelines
- `/automations`, `/automations/$id` — workflow list + drag-and-drop builder (`@dnd-kit/sortable`)
- `/automations/$id/runs` — run history
- Camera detail gets a **Presets** tab and a **Bridge** setup card with the pairing token

**Build order:** schema → bridge API routes → bridge script + pairing → presets sync UI → areas → workflow builder → scheduler + run history → AI compare step.
