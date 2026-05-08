// Mock camera helper — returns a deterministic stock image URL that
// "drifts" over time so scheduled snapshots look like a progressing tank.

// Real reef tank photos seeded into /public/seed — used as both the
// snapshot frames AND poster previews for the looping video feed.
const TANK_FRAMES = ["/seed/tank1.jpg", "/seed/tank2.jpg", "/seed/tank3.jpg", "/seed/tank4.jpg"];
export const MOCK_LIVE_VIDEO = "/seed/tank-loop.mp4";

export function mockSnapshotUrl(seed: number, at: Date = new Date()) {
  // Cycle through the real tank frames so the AI gets an analyzable image.
  const slot = Math.floor(at.getTime() / (10 * 60 * 1000)) + seed;
  return TANK_FRAMES[Math.abs(slot) % TANK_FRAMES.length];
}

export function mockLiveUrl(seed: number) {
  // For thumbnail previews where <video> isn't used.
  return mockSnapshotUrl(seed);
}

export const CAMERA_BRANDS = [
  { id: "ezviz", label: "Ezviz" },
  { id: "imou", label: "Imou" },
  { id: "hikvision", label: "Hikvision" },
  { id: "rtsp", label: "RTSP / ONVIF" },
  { id: "mock", label: "Demo camera" },
] as const;

export const INTERVAL_OPTIONS = [
  { value: 1, label: "Every 1 min" },
  { value: 5, label: "Every 5 min" },
  { value: 10, label: "Every 10 min" },
  { value: 30, label: "Every 30 min" },
  { value: 60, label: "Every hour" },
  { value: 1440, label: "Daily" },
];

export function isWithinWindow(now: Date, start?: string | null, end?: string | null) {
  if (!start || !end) return true;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e;
}
