// Bridge to the native "CameraBridge" plugin that ships in the iOS/Android
// projects (see MOBILE_APP_SETUP.md). In the browser this is a no-op and the
// existing screen-capture / <img> fallback is used.
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface CameraBridgePlugin {
  /** Fetch a single JPEG snapshot from a Dahua camera over HTTP digest auth. */
  snapshot(options: {
    host: string;        // e.g. "192.168.1.50" or "myreef.duckdns.org:8080"
    username: string;
    password: string;
    channel?: number;    // defaults to 1
  }): Promise<{ base64: string }>; // raw JPEG, base64-encoded (no data: prefix)

  /** Start a native RTSP player rendered under the webview. */
  startRtsp(options: {
    url: string;         // e.g. rtsp://user:pass@192.168.1.50:554/cam/realmonitor?channel=1&subtype=1
  }): Promise<void>;

  stopRtsp(): Promise<void>;
}

export const CameraBridge = registerPlugin<CameraBridgePlugin>("CameraBridge");

export const isNativeApp = () => Capacitor.isNativePlatform();

/** Convert base64 JPEG to Blob + data URL for uploads. */
export function base64JpegToBlob(base64: string): { blob: Blob; dataUrl: string } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  return { blob, dataUrl: `data:image/jpeg;base64,${base64}` };
}
