# Hidden Tunes — Android build & testing workflow

All commands from **`hidden-tunes-app/`**.

## Which APK should I use?

| Build type | EAS profile | Opens directly? | Metro / QR / tunnel? | Use for |
|------------|-------------|-----------------|----------------------|---------|
| **Preview (recommended daily)** | `preview` | **Yes** | **No** | Normal testing: playback, search, lock screen |
| **Development Client** | `developmentClient` | **No** — dev launcher first | **Yes** | Native debugging, instant reload, RNTP work |
| **Production** | `production` | Yes | No | Play Store release (AAB) |

If the app shows an **Expo dev server / connection / QR screen**, you installed a **Development Client** build by mistake. Uninstall it and install a **preview** APK instead.

---

## Recommended daily workflow (standalone tester)

### 1. Build preview APK (once per JS/native release cycle)

```bash
cd hidden-tunes-app
npm run verify:preview-config
npm run build:preview:android
```

Same as:

```bash
eas build --profile preview --platform android
```

If upload fails with a missing `.next` path under `hidden-tunes-backend`, ensure the repo root `.easignore` is present (preview builds exclude the admin backend).

### 2. Install

1. Open the EAS build page when the build finishes.
2. Download the **APK** (`buildType: apk`, internal distribution).
3. Install on your phone (allow unknown sources if prompted).
4. Open **Hidden Tunes** — you should land in the app **immediately** (tabs/home), not Expo Connect.

### 3. Test normally

- No `npm start`
- No QR code
- No tunnel
- No USB
- Works on Wi‑Fi or mobile data

Rebuild preview when you change **native** code or need a fresh JS bundle baked into the APK.

---

## Development Client (advanced only)

Use **only** when you need:

- Instant reload / Fast Refresh while editing JS
- Live debugging of native modules (`react-native-track-player`, `expo-media-control`)
- Tunnel / LAN connection to Metro on your laptop

### Build

```bash
npm run build:dev-client:android
```

or:

```bash
eas build --profile developmentClient --platform android
```

### Run Metro

```bash
npm run start:dev-client:tunnel
```

Open the dev build → scan QR or enter tunnel URL. See [development-client-workflow.md](./development-client-workflow.md).

---

## Production

Play Store–style release (Android App Bundle):

```bash
eas build --profile production --platform android
```

Not for day-to-day testing on a personal device.

---

## EAS profiles (`eas.json`)

| Profile | `developmentClient` | Android output | Distribution |
|---------|---------------------|------------------|--------------|
| `developmentClient` | `true` | APK | internal |
| `preview` | **`false`** | APK | internal |
| `production` | **`false`** | AAB | store |

Preview is configured as a **standalone internal APK** — not a dev client.

`app.config.js` removes the `expo-dev-client` plugin from **preview** and **production** builds so the APK does not ship the dev launcher UI. Run `npm run verify:preview-config` locally to confirm before kicking off EAS.

---

## Store-readiness foundation (preview QA)

| Item | Preview build |
|------|----------------|
| App name (launcher) | **Hidden Tunes** (`app.json` → `name`) |
| Android package | `com.hiddentunes.app` |
| Icon / adaptive icon | `./assets/images/icon.png` on black |
| Splash | Black background + icon (`expo-splash-screen` plugin) |
| Permissions | Playback only — `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`; mic blocked |
| Dev client plugin | **Stripped** on preview/production |
| Notification metadata | Song title + artist via Track Player sanitization; album falls back to **Hidden Tunes** |
| Offline / network copy | Calm tester copy in Home, Explore, Search, TV, Radio, Lyrics |

Preview APKs bundle JS — no Metro, QR, tunnel, or `localhost` connection UI.

## npm scripts

| Script | Command |
|--------|---------|
| `build:preview:android` | Standalone tester APK (daily) |
| `build:preview:ios` | Standalone tester IPA (internal) |
| `build:dev-client:android` | Dev client APK (Metro required) |
| `build:dev-client:ios` | Dev client iOS (Metro required) |

---

## Validation checklist (preview APK)

After installing the **preview** build:

- [ ] App icon opens **Hidden Tunes** (not “Connect to Metro” / dev launcher)
- [ ] No QR scanner as the first screen
- [ ] No `localhost` / `exp://` connection UI
- [ ] Search: type an artist or mood — results appear quickly; tap plays
- [ ] Playback: pause/play, next/previous, lock-screen controls
- [ ] Swipe app away from recents — audio stops (preview + native queue)
- [ ] Notification shows song title + artist (not sitemap/error text)
- [ ] Genre pages load with calm empty copy if no tracks
- [ ] Queue tab responds without blank screens
- [ ] Works on mobile data (no Metro required)

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Expo connection screen on launch | Dev Client APK installed | Uninstall → `npm run build:preview:android` → install that APK |
| “Install blocked” | Unknown sources | Allow installs from browser/files |
| Old behavior after new code | Stale APK | Rebuild preview profile |
| Need instant reload | Using preview | Switch to dev client + Metro (see above) |

---

## Related files

- `hidden-tunes-app/eas.json` — profile definitions
- `hidden-tunes-app/app.config.js` — dev-client plugin only on `developmentClient` profile
- `hidden-tunes-app/package.json` — build scripts
- `docs/development-client-workflow.md` — tunnel / Metro / remote dev
