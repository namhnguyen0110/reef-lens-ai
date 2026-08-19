# Reef Tank AI — LAN bridge

The camera lives on your home network and needs HTTP **digest auth** for PTZ and
snapshots. A browser on an https site cannot do that, so a tiny Node script on a
machine at home does the driving. It only makes **outbound** calls — no port
forwarding, no inbound access to your LAN.

```
app (cloud)  <—— polls ——  bridge (your Mac/Pi)  ——>  Dahua camera (LAN)
```

## 1. Requirements

- Node 20+ on a machine that stays on and is on the same Wi-Fi/LAN as the camera.
- The camera's IP, username and password.
- A pairing token from the app: **Cameras → your camera → Presets tab → Generate bridge token**.

## 2. Run it

```bash
REEF_TOKEN=rbr_xxxxxxxxxxxx \
CAMERA_HOST=192.168.1.213 \
CAMERA_USER=admin \
CAMERA_PASS=your-camera-password \
node bridge/reef-bridge.mjs
```

On start it reads your camera's saved PTZ presets and syncs them into the app,
then polls every 15 seconds for automations that are due.

Optional environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `REEF_URL` | `https://reef-lens-ai.lovable.app` | Cloud base URL |
| `CAMERA_ID` | bridge's bound camera | Camera UUID from the app |
| `CHANNEL` | `1` | Dahua channel |
| `POLL_MS` | `15000` | Poll interval |
| `SYNC_PRESETS` | `1` | Set `0` to skip preset sync on startup |

## 3. Keep it running

macOS (launchd) or Linux (systemd) both work. Quick systemd unit:

```ini
[Unit]
Description=Reef Tank AI bridge
After=network-online.target

[Service]
Environment=REEF_TOKEN=rbr_xxx
Environment=CAMERA_HOST=192.168.1.213
Environment=CAMERA_USER=admin
Environment=CAMERA_PASS=secret
ExecStart=/usr/bin/node /home/pi/reef/bridge/reef-bridge.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```

## 4. What it does per run

1. Claims one due run (leased, so two bridges never double-run it).
2. Walks the steps in order: go to preset → settle → capture photo/burst →
   save into an area folder → wait → AI compare.
3. Uploads each JPEG with a timestamp and reports every step's status back,
   so the app's run history shows exactly what happened.

If the bridge is offline, scheduled runs simply don't fire; nothing queues up
forever.
