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

## 4. Test loop

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

## 5. RTSP live preview (optional, later)

The plugin has `startRtsp` / `stopRtsp` stubs. To render a moving picture,
inflate a `VLCVideoView` (iOS) or `PlayerView` (Android) into the Capacitor
webview host at a fixed rect. Skip until snapshots are working end-to-end.
