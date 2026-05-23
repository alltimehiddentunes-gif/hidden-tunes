# Hidden Tunes — Development Client & Remote Tunnel Workflow

All commands run from **`hidden-tunes-app/`** unless noted.

> **Daily Android testing (playback, search, lock screen):** use a **preview APK**, not a dev client.  
> See **[android-build-workflow.md](./android-build-workflow.md)** — `npm run build:preview:android` → install once → app opens directly (no Metro, no QR).

This document is for **Development Client + Metro + tunnel** only (native debugging and instant reload).

---

## SDK 54 compatibility (verified)

| Package | Project version | Role |
|---------|-----------------|------|
| `expo` | `~54.0.33` | SDK 54 |
| `expo-dev-client` | `~6.0.21` | Custom dev binary (not Expo Go) |
| `@expo/ngrok` | `^4.1.0` (devDependency) | Required for `--host tunnel` / `--tunnel` |

Run `npx expo-doctor` in `hidden-tunes-app` — should pass all checks.

**Expo Orbit** is optional (install dev builds, manage devices). It is **not** required for tunneling. Tunneling is handled by Expo CLI + `@expo/ngrok`.

---

## One-time setup (each platform)

### 1. Install dependencies

```bash
cd hidden-tunes-app
npm install --legacy-peer-deps
npm run verify:tunnel-deps
```

### 2. Build & install the Development Client (EAS)

**Android (APK):**

```bash
npm run build:dev-client:android
```

Install the APK from the EAS build page.

**iPhone:**

```bash
npm run build:dev-client:ios
```

Install from EAS link; trust the developer certificate if prompted.

> Rebuild after **native** changes (`app.json` plugins, new native modules, Track Player upgrades).

---

## Daily remote workflow (recommended)

```bash
cd hidden-tunes-app
npm run start:dev-client:tunnel
```

Equivalent to:

```bash
npx expo start --dev-client --host tunnel
```

(`--host tunnel` and `--tunnel` are the same in Expo CLI.)

### On your phone

1. Open the **Hidden Tunes Development Client** app (not Expo Go).
2. Wait for the terminal to show a **QR code** and a URL like `exp://….exp.direct:80` or similar tunnel host.
3. **Scan the QR** from the dev client, or use **Enter URL** and paste the tunnel URL.
4. Edit JS/TS → save → **Fast Refresh** should work on mobile data.

Clear Metro cache if bundling is stale:

```bash
npm run start:dev-client:clear
```

---

## npm scripts reference

| Script | Command | When to use |
|--------|---------|-------------|
| `verify:tunnel-deps` | Preflight only | After `npm install`, before debugging tunnel |
| `start:tunnel` | Expo + tunnel (no dev-client flag) | Rare; mostly for testing |
| `start:dev-client:tunnel` | **Default remote dev** | Phone on cellular / different network |
| `start:dev-client` | Alias → tunnel dev client | Same as above |
| `start:dev-client:clear` | Tunnel + clear cache | Stale bundle / weird Metro state |
| `start:dev-client:lan` | `--host lan` | Same Wi‑Fi only, faster |
| `start:dev-client:localhost` | `--host localhost` | USB `adb reverse` / simulator |
| `build:dev-client:android` | EAS internal APK | Native changes (Android) |
| `build:dev-client:ios` | EAS internal iPhone build | Native changes (iOS) |

---

## Why tunnel (not LAN)

| Situation | Use |
|-----------|-----|
| Phone on **mobile data**, laptop on home Wi‑Fi | `start:dev-client:tunnel` |
| Public / guest Wi‑Fi with client isolation | Tunnel |
| Corporate firewall blocks device ↔ laptop | Tunnel |
| Same Wi‑Fi, tunnel slow or ngrok errors | `start:dev-client:lan` |

Tunnel is slower than LAN but works across networks.

---

## QR code & permissions

### Android

- **Camera permission** — required to scan QR in the dev client.
- **Settings → Apps → Hidden Tunes (dev build) → Permissions** — allow Camera.
- If scan fails, use **Enter URL manually** in the dev client and paste the `exp://…` URL from the terminal.

### iPhone

- **Settings → Privacy & Security → Camera** — allow for the dev build.
- iOS may block QR from screenshots; scan from the **live terminal** or paste URL manually.

### General

- Sign in to Expo (`npx expo login`) on the machine running Metro — helps with some EAS/tunnel features.
- Use the **development build**, not Expo Go (Expo Go cannot load our native modules).

---

## Tunnel troubleshooting

### `Please install @expo/ngrok@^4.1.0`

```bash
cd hidden-tunes-app
npx expo install @expo/ngrok --dev
npm run verify:tunnel-deps
```

Install **in the project** (not only global). On Windows, allow `@expo/ngrok` through antivirus — it bundles an `ngrok` binary that Defender sometimes quarantines.

### `ngrok tunnel took too long to connect` / timeout

Common causes:

1. **Shared Expo ngrok capacity** — intermittent; retry in 1–2 minutes or use manual ngrok (below).
2. **Antivirus / firewall** — allow Node.js, `ngrok`, and port **8081** (Metro).
3. **VPN on phone or laptop** — disable VPN on both sides and retry.
4. **Sleep / network switch** — wake laptop, keep terminal open, restart tunnel.

### QR scan does nothing

1. Confirm URL in terminal starts with `exp://` and is from **this** Metro session.
2. Open dev client → **Enter URL** → paste full URL.
3. Run `npm run start:dev-client:clear` and reconnect.

### Phone on mobile data still cannot connect

1. Confirm laptop has internet (tunnel needs outbound HTTPS).
2. Run `npm run verify:tunnel-deps`.
3. Try manual ngrok fallback (reliable long-term):

```bash
# Terminal 1 — Metro on LAN (local only)
npm run start:dev-client:lan

# Terminal 2 — your own ngrok account (free tier)
ngrok http 8081 --host-header=rewrite

# Terminal 1 — set proxy to ngrok HTTPS URL (example)
# Windows PowerShell:
$env:EXPO_PACKAGER_PROXY_URL="https://YOUR-SUBDOMAIN.ngrok-free.app"
npx expo start --dev-client --host lan --max-workers 1
```

Open dev client with the ngrok URL shown in terminal / dev tools.

### Windows firewall

- Allow **Node.js** and **ngrok** on Private + Public networks when prompted.
- Or: Windows Security → Firewall → Allow an app → Node.js.

### `expo start` works on LAN but not tunnel

Expected when ngrok is blocked. Use `start:dev-client:lan` at home, or manual ngrok when remote.

### Port 8081 already in use

Another Metro instance is running. Either:

```bash
# Stop the old terminal running Expo, then:
npm run start:dev-client:tunnel
```

Or use another port:

```bash
# PowerShell
$env:EXPO_METRO_PORT="8082"
npm run start:dev-client:tunnel
```

The launcher sets `CI=1` so Expo can pick the next free port when the default is busy.

---

## Rebuild vs instant reload

| Change | Instant reload | Rebuild dev client |
|--------|----------------|--------------------|
| React screens, styles, JS logic | Yes | No |
| `USE_NATIVE_TRACK_PLAYER` flag | Yes | No |
| `app.json` plugins / permissions | No | **Yes** |
| Native module upgrades | No | **Yes** |
| `expo-dev-client` version bump | No | **Yes** |

---

## Expo Go vs Development Client

| | Development Client | Expo Go |
|--|-------------------|---------|
| Track Player | Yes (with flag) | **No** |
| Lock-screen queue QA | Yes | **Invalid** |
| Remote tunnel testing | Yes | Limited / not for native QA |

---

## EAS profiles

| Profile | Use |
|---------|------|
| `developmentClient` | Daily dev binary |
| `preview` | QA / stakeholders |
| `production` | Store |

---

## Validation checklist

After `npm run start:dev-client:tunnel`:

- [ ] Terminal shows **QR code**
- [ ] URL contains tunnel host (e.g. `exp.direct` or ngrok)
- [ ] `npm run verify:tunnel-deps` passes
- [ ] Dev client opens project (not Expo Go)
- [ ] Edit a screen → save → **Fast Refresh** on phone (Wi‑Fi or mobile data)

---

## Related files

- `hidden-tunes-app/package.json` — tunnel scripts
- `hidden-tunes-app/scripts/verify-dev-tunnel-deps.js` — preflight
- `hidden-tunes-app/scripts/start-expo-tunnel.js` — tunnel launcher
- `hidden-tunes-app/eas.json` — `developmentClient` profile
- `hidden-tunes-app/app.json` — `expo-dev-client` plugin
