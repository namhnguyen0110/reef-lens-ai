# Reef Tank AI — Mobile App Setup (Capacitor, Path A)

This wraps the existing web app as a real iOS/Android app so it can talk to
your Dahua camera on the LAN (or via port-forwarding) without any browser
CORS/mixed-content blocking.

Everything in this file is done **on your computer** — not in Lovable — because
Xcode and Android Studio only run locally.

---

## 0. What's already in the repo

- `capacitor.config.ts` — app id `app.lovable.reeftankai`, name "Reef Tank AI"
- `src/lib/native-camera.ts` — TS bridge to the native `CameraBridge` plugin
- `src/routes/cameras.$id.tsx` already prefers the native snapshot path when
  it detects it is running inside Capacitor; browser preview still works.

## 1. One-time local setup

Requirements:
- **iOS:** a Mac with Xcode 15+, CocoaPods (`sudo gem install cocoapods`)
- **Android:** Android Studio + JDK 17

```bash
# clone your Lovable project locally, then:
bun install
bun run build          # produces dist/client — Capacitor's webDir
npx cap add ios
npx cap add android
npx cap sync
```

You'll now have `ios/` and `android/` folders. Commit them.

Every time you change web code:
```bash
bun run build && npx cap sync
```

Open the native projects:
```bash
npx cap open ios         # → Xcode
npx cap open android     # → Android Studio
```

---

## 2. iOS — CameraBridge plugin

Add `MobileVLCKit` to `ios/App/Podfile` (inside the `target 'App' do` block):

```ruby
pod 'MobileVLCKit', '~> 3.6.0'
```

Then:
```bash
cd ios/App && pod install && cd ../..
```

Create `ios/App/App/CameraBridge.swift`:

```swift
import Foundation
import Capacitor
import MobileVLCKit

@objc(CameraBridge)
public class CameraBridge: CAPPlugin {
    private var player: VLCMediaPlayer?

    @objc func snapshot(_ call: CAPPluginCall) {
        guard let host = call.getString("host"),
              let user = call.getString("username"),
              let pass = call.getString("password") else {
            call.reject("missing host/username/password"); return
        }
        let channel = call.getInt("channel") ?? 1
        guard let url = URL(string: "http://\(host)/cgi-bin/snapshot.cgi?channel=\(channel)") else {
            call.reject("bad url"); return
        }

        // URLSession handles HTTP Digest auth automatically via URLCredential.
        let cfg = URLSessionConfiguration.default
        let delegate = DigestDelegate(user: user, pass: pass)
        let session = URLSession(configuration: cfg, delegate: delegate, delegateQueue: nil)
        let task = session.dataTask(with: url) { data, resp, err in
            if let err = err { call.reject(err.localizedDescription); return }
            guard let data = data, !data.isEmpty else { call.reject("empty response"); return }
            call.resolve(["base64": data.base64EncodedString()])
        }
        task.resume()
    }

    @objc func startRtsp(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("bad url"); return
        }
        DispatchQueue.main.async {
            let media = VLCMedia(url: url)
            let p = VLCMediaPlayer()
            p.media = media
            // Attach to a view in the webview host — see docs in this file
            p.play()
            self.player = p
            call.resolve()
        }
    }

    @objc func stopRtsp(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player?.stop(); self.player = nil; call.resolve() }
    }
}

class DigestDelegate: NSObject, URLSessionDataDelegate {
    let user: String; let pass: String
    init(user: String, pass: String) { self.user = user; self.pass = pass }
    func urlSession(_ s: URLSession, task: URLSessionTask,
                    didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.previousFailureCount == 0 {
            let cred = URLCredential(user: user, password: pass, persistence: .forSession)
            completionHandler(.useCredential, cred)
        } else { completionHandler(.cancelAuthenticationChallenge, nil) }
    }
}
```

Create `ios/App/App/CameraBridge.m` (registers the plugin with Capacitor):

```objc
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(CameraBridge, "CameraBridge",
    CAP_PLUGIN_METHOD(snapshot,   CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startRtsp,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopRtsp,   CAPPluginReturnPromise);
)
```

In `ios/App/App/Info.plist` allow cleartext LAN HTTP:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key><true/>
</dict>
<key>NSLocalNetworkUsageDescription</key>
<string>Reef Tank AI talks to your aquarium camera on your Wi-Fi.</string>
```

---

## 3. Android — CameraBridge plugin

Add ExoPlayer + OkHttp to `android/app/build.gradle` `dependencies { ... }`:

```gradle
implementation "androidx.media3:media3-exoplayer:1.4.1"
implementation "androidx.media3:media3-exoplayer-rtsp:1.4.1"
implementation "androidx.media3:media3-ui:1.4.1"
implementation "com.squareup.okhttp3:okhttp:4.12.0"
implementation "com.burgstaller:okhttp-digest:3.1.0"
```

In `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<!-- allow http://<lan-ip> without TLS -->
<application ... android:usesCleartextTraffic="true">
```

Create `android/app/src/main/java/app/lovable/reeftankai/CameraBridge.java`:

```java
package app.lovable.reeftankai;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.burgstaller.okhttp.AuthenticationCacheInterceptor;
import com.burgstaller.okhttp.CachingAuthenticatorDecorator;
import com.burgstaller.okhttp.digest.DigestAuthenticator;
import com.burgstaller.okhttp.digest.Credentials;
import com.burgstaller.okhttp.DispatchingAuthenticator;

import java.util.concurrent.ConcurrentHashMap;
import okhttp3.*;

@CapacitorPlugin(name = "CameraBridge")
public class CameraBridge extends Plugin {

    @PluginMethod
    public void snapshot(PluginCall call) {
        String host = call.getString("host");
        String user = call.getString("username");
        String pass = call.getString("password");
        Integer channel = call.getInt("channel", 1);
        if (host == null || user == null || pass == null) { call.reject("missing creds"); return; }

        DigestAuthenticator digest = new DigestAuthenticator(new Credentials(user, pass));
        DispatchingAuthenticator auth = new DispatchingAuthenticator.Builder().with("digest", digest).build();
        OkHttpClient client = new OkHttpClient.Builder()
            .authenticator(new CachingAuthenticatorDecorator(auth, new ConcurrentHashMap<>()))
            .addInterceptor(new AuthenticationCacheInterceptor(new ConcurrentHashMap<>()))
            .build();

        Request req = new Request.Builder()
            .url("http://" + host + "/cgi-bin/snapshot.cgi?channel=" + channel).get().build();

        client.newCall(req).enqueue(new Callback() {
            @Override public void onFailure(Call c, java.io.IOException e) { call.reject(e.getMessage()); }
            @Override public void onResponse(Call c, Response r) throws java.io.IOException {
                if (!r.isSuccessful() || r.body() == null) { call.reject("http " + r.code()); return; }
                byte[] bytes = r.body().bytes();
                JSObject out = new JSObject();
                out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                call.resolve(out);
            }
        });
    }

    @PluginMethod public void startRtsp(PluginCall call) { call.resolve(); /* wire ExoPlayer view */ }
    @PluginMethod public void stopRtsp(PluginCall call)  { call.resolve(); }
}
```

Register it in `android/app/src/main/java/app/lovable/reeftankai/MainActivity.java`:

```java
@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(CameraBridge.class);
    super.onCreate(savedInstanceState);
}
```

---

## 4. Android on Mac — super simple guide

> **Note:** "Android Auto" is the car dashboard system. The app you build Android apps in is called **Android Studio**. This guide uses Android Studio on your Mac.

### 4.1. Install the tools (one time)

On your Mac, install these:

1. **Android Studio** — download from https://developer.android.com/studio and drag it into Applications.
2. **Bun** — open Terminal and run:
   ```bash
   brew install oven-sh/bun/bun
   ```
   If you don't have Homebrew, install it first from https://brew.sh
3. **Git** — usually already installed on Macs. Type `git --version` in Terminal to check.

### 4.2. Download the project

1. Open **Terminal** on your Mac.
2. Pick a folder for the project. Most people use `Documents`:
   ```bash
   cd ~/Documents
   ```
3. Get your project URL from Lovable (there is a "Copy repo URL" or "Open in GitHub" button in the project). Then run:
   ```bash
   git clone <paste-your-project-url-here>
   ```
   For example, it will look something like:
   ```bash
   git clone https://github.com/yourname/reef-tank-ai.git
   ```
4. Move into the project folder:
   ```bash
   cd reef-tank-ai
   ```
   (Use whatever folder name was created.)

### 4.3. Build the web part and create the Android project

In the same Terminal window, run these one at a time:

```bash
bun install           # downloads the web app libraries
bun run build         # creates dist/client, the web files Capacitor uses
npx cap add android    # creates the android/ folder with a native Android project
npx cap sync          # copies the web files into the Android project
```

After this, you will have an `android/` folder inside your project. Do not delete it.

### 4.4. Open the Android project in Android Studio

Run:

```bash
npx cap open android
```

This opens Android Studio automatically. The first time it may ask you to download extra SDK components — click **Yes / Accept** and let it finish.

### 4.5. Paste the camera plugin code

In Android Studio's file tree on the left, open:

```
app → java → app.lovable.reeftankai → MainActivity.java
```

Paste the Java code from section 3 of this file (the `CameraBridge.java` and `MainActivity.java` snippets) into the matching files. If Android Studio asks to import anything, press **Alt+Enter** (or **Option+Enter**) and choose **Import class**.

### 4.6. Prepare your Android phone

1. Plug your Android phone into the Mac with a USB cable.
2. On the phone, go to **Settings → About phone**.
3. Find **Build number** and tap it **7 times** until it says "You are now a developer."
4. Go back to Settings, now there is a new menu called **Developer options**.
5. Open it and turn on **USB debugging**.
6. When a popup asks "Allow USB debugging?", tap **OK**.

### 4.7. Run the app on your phone

In Android Studio, near the top center you will see a green **▶ (Run)** button. Click it.

After a few moments, your phone should appear in the list. Choose it and press **OK**.

Android Studio will build the app and install it on your phone. The first build takes a few minutes.

### 4.8. Use the app with your camera

1. Open **Reef Tank AI** on your phone.
2. Add your camera with the local IP address, for example:
   - Host: `192.168.1.50`
   - Username: your camera login
   - Password: your camera password
3. Tap **Capture**. The app will talk directly to the camera over your Wi-Fi.

### 4.9. What to do when you change the web code later

Every time you update the web app in Lovable, run this on your Mac:

```bash
bun run build && npx cap sync
```

Then press the green ▶ button in Android Studio again.

### 4.10. Using the camera outside your home (port forwarding)

To use the app when you are not on the same Wi-Fi, you need to forward two ports on your home router to your camera's local IP:

- **Port 80** (HTTP) — for snapshots
- **Port 554** (RTSP) — for live video later

This is done in your router's admin page. Look for **Port Forwarding** or **Virtual Servers**. Set them to your camera's local IP (e.g. `192.168.1.50`).

Then in the app, use your public address instead of the local IP, for example:

```
myreef.duckdns.org:8080
```

(You can get a free hostname from DuckDNS if your home internet changes IP.)

---

## 5. Test loop

```bash
bun run build && npx cap sync
npx cap open ios     # ▶ on your iPhone in Xcode
# or
npx cap open android # ▶ on your Android in Android Studio
```

Add your camera in the app with the LAN host (e.g. `192.168.1.50`) plus
username/password. The Capture button will now call `CameraBridge.snapshot`
natively, upload the JPEG to Lovable Cloud, and add it to the timeline —
exactly like the web flow but without CORS.

## 6. RTSP live preview (optional, later)

The plugin has `startRtsp` / `stopRtsp` stubs. To render a moving picture,
inflate a `VLCVideoView` (iOS) or `PlayerView` (Android) into the Capacitor
webview host at a fixed rect. Skip until snapshots are working end-to-end.
