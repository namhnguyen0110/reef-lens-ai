Here are the dummy Android-on-Mac instructions directly in the chat. (The same guide was also added to `MOBILE_APP_SETUP.md`.)

---

## Android on Mac — super simple guide

> **Note:** "Android Auto" is the car dashboard system. The app you build Android apps in is called **Android Studio**. This guide uses Android Studio on your Mac.

### 1. Install the tools (one time)

On your Mac, install these:

1. **Android Studio** — download from https://developer.android.com/studio and drag it into Applications.
2. **Bun** — open Terminal and run:
   ```bash
   brew install oven-sh/bun/bun
   ```
   If you don't have Homebrew, install it first from https://brew.sh
3. **Git** — usually already installed on Macs. Type `git --version` in Terminal to check.

### 2. Download the project

1. Open **Terminal** on your Mac.
2. Pick a folder for the project. Most people use `Documents`:
   ```bash
   cd ~/Documents
   ```
3. Get your project URL from Lovable (look for a "Copy repo URL" or "Open in GitHub" button). Then run:
   ```bash
   git clone <paste-your-project-url-here>
   ```
   For example:
   ```bash
   git clone https://github.com/yourname/reef-tank-ai.git
   ```
4. Move into the project folder:
   ```bash
   cd reef-tank-ai
   ```
   (Use the folder name that was created.)

### 3. Build the web part and create the Android project

In the same Terminal window, run these one at a time:

```bash
bun install           # downloads the web app libraries
bun run build         # creates dist/client, the web files Capacitor uses
npx cap add android    # creates the android/ folder with a native Android project
npx cap sync          # copies the web files into the Android project
```

After this, you will have an `android/` folder inside your project. Do not delete it.

### 4. Open the Android project in Android Studio

Run:

```bash
npx cap open android
```

This opens Android Studio automatically. The first time it may ask you to download extra SDK components — click **Yes / Accept** and let it finish.

### 5. Paste the camera plugin code

In Android Studio's file tree on the left, open:

```
app → java → app.lovable.reeftankai → MainActivity.java
```

Paste the Java code from the `## 3. Android — CameraBridge plugin` section of `MOBILE_APP_SETUP.md` (the `CameraBridge.java` and `MainActivity.java` snippets) into the matching files. If Android Studio asks to import anything, press **Alt+Enter** (or **Option+Enter**) and choose **Import class**.

### 6. Prepare your Android phone

1. Plug your Android phone into the Mac with a USB cable.
2. On the phone, go to **Settings → About phone**.
3. Find **Build number** and tap it **7 times** until it says "You are now a developer."
4. Go back to Settings, now there is a new menu called **Developer options**.
5. Open it and turn on **USB debugging**.
6. When a popup asks "Allow USB debugging?", tap **OK**.

### 7. Run the app on your phone

In Android Studio, near the top center you will see a green **▶ (Run)** button. Click it.

After a few moments, your phone should appear in the list. Choose it and press **OK**.

Android Studio will build the app and install it on your phone. The first build takes a few minutes.

### 8. Use the app with your camera

1. Open **Reef Tank AI** on your phone.
2. Add your camera with the local IP address, for example:
   - Host: `192.168.1.50`
   - Username: your camera login
   - Password: your camera password
3. Tap **Capture**. The app will talk directly to the camera over your Wi-Fi.

### 9. When you change the web code later

Every time you update the web app in Lovable, run this on your Mac:

```bash
bun run build && npx cap sync
```

Then press the green ▶ button in Android Studio again.

### 10. Using the camera outside your home (port forwarding)

To use the app when you are not on the same Wi-Fi, you need to forward two ports on your home router to your camera's local IP:

- **Port 80** (HTTP) — for snapshots
- **Port 554** (RTSP) — for live video later

This is done in your router's admin page. Look for **Port Forwarding** or **Virtual Servers**. Set them to your camera's local IP (e.g. `192.168.1.50`).

Then in the app, use your public address instead of the local IP, for example:

```
myreef.duckdns.org:8080
```

You can get a free hostname from DuckDNS if your home internet changes IP.

---

No further code changes needed — this is just the instructions delivered in chat.