// Mock camera helper — returns a deterministic stock image URL that
// "drifts" over time so scheduled snapshots look like a progressing tank.

const POOL_SIZE = 12;

export function mockSnapshotUrl(seed: number, at: Date = new Date()) {
  // Slot changes every ~10 minutes so a fast schedule still shows variation.
  const slot = Math.floor(at.getTime() / (10 * 60 * 1000)) % POOL_SIZE;
  const tag = `reef-${seed}-${slot}`;
  return `https://picsum.photos/seed/${tag}/1024/640`;
}

export function mockLiveUrl(seed: number) {
  // Live preview re-fetches every few seconds — append a cache-buster so
  // the image element refreshes.
  return `${mockSnapshotUrl(seed)}?t=${Math.floor(Date.now() / 4000)}`;
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
