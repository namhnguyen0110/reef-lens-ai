Add a super-simple "Android on Mac" quickstart section to `MOBILE_APP_SETUP.md`.

What you already have in the repo is the Capacitor wrapper, a TypeScript bridge, and an Android plugin code snippet. This plan covers the steps to get it onto your Android phone from a Mac, written in plain English.

### What I will add to the docs

1. **Prerequisites** (one-time install on your Mac)
   - Android Studio
   - Java 17 (JDK) — Android Studio usually installs this
   - Bun (Node package runner) — `brew install oven-sh/bun/bun`
   - Git command line

2. **Download the project**
   - Open Terminal
   - Pick a folder (e.g. `Documents`)
   - Run `git clone <repo-url>` (I will point you to where to get the URL from Lovable)
   - `cd` into the project folder

3. **Install web dependencies and build the web app**
   - `bun install`
   - `bun run build`

4. **Add Android platform files**
   - `npx cap add android`
   - `npx cap sync`
   - Explain that `npx cap open android` will open the project in Android Studio

5. **Paste the plugin code**
   - Show exactly which file to open in Android Studio
   - Reference the Java code block from the existing guide

6. **Enable USB debugging on your phone**
   - Settings → About phone → tap Build number 7 times
   - Developer options → USB debugging
   - Plug phone into Mac with a cable

7. **Run the app from Android Studio**
   - Press the green ▶ button
   - Choose your phone when it appears

8. **What to do in the app**
   - Add the camera with the local IP (e.g. `192.168.1.50`) plus username and password
   - Tap Capture

9. **Optional: port forwarding for remote access**
   - Brief reminder that to use the camera outside your home, you forward port 80 and 554 on your router to the camera’s IP

I will also clarify that "Android Auto" is a car system — the app you build Android apps in is called **Android Studio**.

After approval, I will update `MOBILE_APP_SETUP.md` with this new section.