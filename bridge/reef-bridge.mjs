#!/usr/bin/env node
/**
 * Reef Tank AI — LAN bridge
 * ------------------------------------------------------------------
 * Runs on a machine that stays on at home (Mac mini, NUC, Raspberry Pi).
 * It polls the cloud app for due automation runs, drives the Dahua camera
 * over its HTTP CGI API (PTZ presets + snapshots) and uploads the frames.
 *
 * Nothing is exposed to the internet: the bridge only makes OUTBOUND calls.
 *
 * Usage:
 *   REEF_TOKEN=rbr_xxx CAMERA_HOST=192.168.1.213 CAMERA_USER=admin \
 *   CAMERA_PASS=secret node bridge/reef-bridge.mjs
 *
 * Optional env:
 *   REEF_URL     cloud base url (default https://reef-lens-ai.lovable.app)
 *   CAMERA_ID    uuid of the camera in the app (else the bridge's bound camera)
 *   CHANNEL      Dahua channel number (default 1)
 *   POLL_MS      poll interval (default 15000)
 *   SYNC_PRESETS set to "0" to skip the preset sync at startup
 */

import crypto from "node:crypto";

const BASE = (process.env.REEF_URL || "https://reef-lens-ai.lovable.app").replace(/\/$/, "");
const TOKEN = process.env.REEF_TOKEN;
const HOST = (process.env.CAMERA_HOST || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const USER = process.env.CAMERA_USER || "admin";
const PASS = process.env.CAMERA_PASS || "";
const CAMERA_ID = process.env.CAMERA_ID || "";
const CHANNEL = Number(process.env.CHANNEL || 1);
const POLL_MS = Number(process.env.POLL_MS || 15000);

if (!TOKEN || !HOST) {
  console.error("Missing REEF_TOKEN or CAMERA_HOST. See bridge/README.md");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* HTTP digest auth against the camera                                  */
/* ------------------------------------------------------------------ */

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
let nc = 0;

function buildDigestHeader(challenge, method, uri) {
  const parts = {};
  challenge
    .replace(/^Digest\s+/i, "")
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .forEach((piece) => {
      const idx = piece.indexOf("=");
      if (idx < 0) return;
      const k = piece.slice(0, idx).trim();
      const v = piece.slice(idx + 1).trim().replace(/^"|"$/g, "");
      parts[k] = v;
    });
  const qop = parts.qop ? parts.qop.split(",")[0].trim() : null;
  const cnonce = crypto.randomBytes(8).toString("hex");
  nc += 1;
  const ncValue = String(nc).padStart(8, "0");
  const ha1 = md5(`${USER}:${parts.realm}:${PASS}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${parts.nonce}:${ncValue}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${parts.nonce}:${ha2}`);
  let header =
    `Digest username="${USER}", realm="${parts.realm}", nonce="${parts.nonce}", uri="${uri}", response="${response}"`;
  if (parts.opaque) header += `, opaque="${parts.opaque}"`;
  if (qop) header += `, qop=${qop}, nc=${ncValue}, cnonce="${cnonce}"`;
  return header;
}

async function cameraGet(path) {
  const url = `http://${HOST}${path}`;
  let res = await fetch(url, { method: "GET" });
  if (res.status === 401) {
    const challenge = res.headers.get("www-authenticate");
    if (!challenge) throw new Error("Camera requires auth but sent no challenge");
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: buildDigestHeader(challenge, "GET", path) },
    });
  }
  if (!res.ok) throw new Error(`Camera ${res.status} on ${path}`);
  return res;
}

/* ------------------------------------------------------------------ */
/* Dahua CGI operations                                                 */
/* ------------------------------------------------------------------ */

async function getPresets() {
  const res = await cameraGet(`/cgi-bin/ptz.cgi?action=getPresets&channel=${CHANNEL}`);
  const text = await res.text();
  // Lines look like: presets[0].Index=1  /  presets[0].Name=Skimmer
  const byIdx = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/presets\[(\d+)\]\.(\w+)=(.*)$/);
    if (!m) continue;
    const entry = byIdx.get(m[1]) || {};
    entry[m[2].toLowerCase()] = m[3].trim();
    byIdx.set(m[1], entry);
  }
  return [...byIdx.values()]
    .filter((e) => e.index)
    .map((e) => ({ number: Number(e.index), name: e.name || `Preset ${e.index}` }));
}

async function gotoPreset(number) {
  await cameraGet(
    `/cgi-bin/ptz.cgi?action=start&channel=${CHANNEL}&code=GotoPreset&arg1=0&arg2=${number}&arg3=0`,
  );
}

async function snapshot() {
  const res = await cameraGet(`/cgi-bin/snapshot.cgi?channel=${CHANNEL}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Cloud API                                                            */
/* ------------------------------------------------------------------ */

async function api(path, body) {
  const res = await fetch(`${BASE}/api/public/bridge/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function upload(buffer, fields) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/jpeg" }), "frame.jpg");
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, String(v));
  const res = await fetch(`${BASE}/api/public/bridge/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `upload HTTP ${res.status}`);
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Run executor                                                         */
/* ------------------------------------------------------------------ */

async function executeRun(run) {
  console.log(`▶ run ${run.id} — ${run.workflow?.name ?? "workflow"} (${run.steps.length} steps)`);
  let currentArea = null;

  for (const step of run.steps) {
    const cfg = step.config || {};
    await api("step", { runId: run.id, position: step.position, type: step.type, status: "running" });
    try {
      let detail = "";
      let photoIds = [];

      if (step.type === "goto_preset") {
        const number = step.preset?.preset_number;
        if (!number) throw new Error("Step has no preset selected");
        await gotoPreset(number);
        const settle = cfg.settleMs ?? step.preset?.settle_ms ?? 3000;
        await sleep(settle);
        if (step.preset?.area_id) currentArea = step.preset.area_id;
        detail = `Moved to preset ${number} (${step.preset?.name ?? ""})`;
      } else if (step.type === "save_area") {
        currentArea = cfg.areaId ?? null;
        detail = "Destination folder set";
      } else if (step.type === "wait") {
        await sleep((cfg.seconds ?? 30) * 1000);
        detail = `Waited ${cfg.seconds ?? 30}s`;
      } else if (step.type === "capture") {
        const areaId = cfg.areaId ?? currentArea;
        if (cfg.mode === "burst") {
          const frames = Math.max(2, Math.min(cfg.frames ?? 10, 30));
          const gap = Math.max(150, Math.round((cfg.durationMs ?? 5000) / frames));
          const burstGroupId = crypto.randomUUID();
          for (let i = 0; i < frames; i++) {
            const jpeg = await snapshot();
            const out = await upload(jpeg, {
              areaId,
              runId: run.id,
              cameraId: CAMERA_ID,
              burstGroupId,
              capturedAt: new Date().toISOString(),
              label: cfg.label || "burst",
            });
            photoIds.push(out.photoId);
            if (i < frames - 1) await sleep(gap);
          }
          detail = `Captured ${photoIds.length}-frame burst`;
        } else {
          const jpeg = await snapshot();
          const out = await upload(jpeg, {
            areaId,
            runId: run.id,
            cameraId: CAMERA_ID,
            capturedAt: new Date().toISOString(),
            label: cfg.label || "photo",
          });
          photoIds.push(out.photoId);
          detail = "Captured 1 photo";
        }
      } else if (step.type === "ai_compare") {
        const out = await api("compare", {
          runId: run.id,
          position: step.position,
          areaId: cfg.areaId ?? currentArea,
          offsets: cfg.offsets,
        });
        detail = out.result ? `${out.result.trend} — ${out.result.summary}` : "Comparison saved";
      } else {
        detail = `Unknown step type ${step.type} — skipped`;
      }

      await api("step", {
        runId: run.id,
        position: step.position,
        type: step.type,
        status: "done",
        detail,
        photoIds,
      });
      console.log(`  ✓ ${step.type}: ${detail}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${step.type}: ${message}`);
      await api("step", {
        runId: run.id,
        position: step.position,
        type: step.type,
        status: "failed",
        detail: message,
        runStatus: "failed",
        runError: message,
      });
      return;
    }
  }

  await api("step", { runId: run.id, runStatus: "done" });
  console.log(`✔ run ${run.id} complete`);
}

/* ------------------------------------------------------------------ */
/* Main loop                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`Reef bridge → ${BASE}  camera http://${HOST}`);

  if (process.env.SYNC_PRESETS !== "0") {
    try {
      const presets = await getPresets();
      const out = await api("presets", { cameraId: CAMERA_ID || undefined, presets });
      console.log(`Synced ${presets.length} presets (${out.added} new)`);
    } catch (err) {
      console.warn("Preset sync failed:", err.message);
    }
  }

  let backoff = POLL_MS;
  for (;;) {
    try {
      const now = new Date();
      const { run } = await api("claim", {
        localTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        localDate: now.toISOString().slice(0, 10),
      });
      backoff = POLL_MS;
      if (run) await executeRun(run);
      else await sleep(POLL_MS);
    } catch (err) {
      console.warn("poll error:", err.message);
      backoff = Math.min(backoff * 2, 5 * 60_000);
      await sleep(backoff);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
