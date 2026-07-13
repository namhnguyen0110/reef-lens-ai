import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.reeftankai",
  appName: "Reef Tank AI",
  webDir: "dist/client",
  server: {
    // For local dev on your phone, uncomment and point to your Mac's LAN IP:
    // url: "http://192.168.1.20:8080",
    // cleartext: true,
    androidScheme: "https",
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: true, // lets the WebView load http://<lan-ip> snapshots as a fallback
  },
};

export default config;
