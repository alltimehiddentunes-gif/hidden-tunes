# Hidden Tunes — Development Client Workflow (Android & iPhone)

All commands run from `hidden-tunes-app/` unless noted.

## Why Development Client (not Expo Go)

| Runtime | Track Player (native queue) | Lock-screen auto-next | expo-av fallback |
|--------|-----------------------------|------------------------|------------------|
| **Development Client** | Yes (when `USE_NATIVE_TRACK_PLAYER = true`) | Testable | Yes, if flag off |
| **EAS preview / production** | Yes | Testable | Yes, if flag off |
| **Expo Go** | **Never** (app will not load RNTP safely) | **Not testable** | **Always** |

Expo Go ships a fixed native binary without `react-native-track-player` or our media plugins.  
Hidden Tunes **lazy-loads** Track Player and **skips registration** in Expo Go on **both Android and iPhone**.

---

## One-time setup per platform

### Android Development Client

```bash
cd hidden-tunes-app
npm install --legacy-peer-deps
npm run build:dev-client:android
```

1. Open the EAS build page when the build finishes.
2. Download/install the **APK** on your test phone.
3. Allow installs from unknown sources if prompted.

### iPhone Development Client

```bash
cd hidden-tunes-app
npm run build:dev-client:ios
```

1. Ensure your Apple Developer account is linked in EAS (`eas credentials`).
2. Register test devices in the Apple Developer portal (internal/ad hoc distribution).
3. Open the EAS build page → install via QR/link on the physical iPhone.
4. **Settings → General → VPN & Device Management** → trust the developer certificate if required.

> iOS builds use `simulator: false` — install on a **real device** for playback and lock-screen testing.

Rebuild **both** platforms after any native change (see table below).

---

## Daily workflow (recommended)

```bash
cd hidden-tunes-app
npm run start:dev-client
```

- **`--tunnel` is the default** in npm scripts so phones on different Wi‑Fi/cellular can reach Metro.
- Open the **Development Client** app (not Expo Go) on the device.
- Scan the QR code or enter the tunnel URL shown in the terminal.
- Edit JS/TS → save → **instant reload** (Fast Refresh).

Clear Metro cache if bundling acts stale:

```bash
npm run start:dev-client:clear
```

---

## Tunnel mode

| Situation | Use tunnel |
|-----------|------------|
| Phone on cellular, laptop on home Wi‑Fi | Yes (default scripts) |
| Corporate/restricted Wi‑Fi | Yes |
| Same LAN, tunnel slow | Optional: `npx expo start --dev-client --lan` |

Tunnel is slower than LAN but reliable across networks. Hidden Tunes dev scripts default to tunnel for Android + iPhone parity.

---

## Rebuild vs instant reload

| Change | Instant reload | Rebuild dev client |
|--------|----------------|--------------------|
| React screens, MiniPlayer, styles | Yes | No |
| `USE_NATIVE_TRACK_PLAYER` flag | Yes | No |
| `PlayerContext` JS logic (non-native) | Yes | No |
| `app.json` plugins / permissions | No | **Yes (both platforms)** |
| Upgrade `react-native-track-player` | No | **Yes (both platforms)** |
| Add/remove native modules | No | **Yes (both platforms)** |
| App icon, splash, bundle ID | No | **Yes (both platforms)** |
| `expo-dev-client` version bump | No | **Yes (both platforms)** |

```bash
npm run build:dev-client:android   # after native Android changes
npm run build:dev-client:ios       # after native iOS changes
```

---

## npm scripts reference

| Script | Purpose |
|--------|---------|
| `start:dev-client` | Metro + dev client + **tunnel** |
| `start:dev-client:clear` | Same, clears cache |
| `build:dev-client:android` | EAS internal APK with native modules |
| `build:dev-client:ios` | EAS internal iPhone build with native modules |

---

## Track Player testing rules

1. **Only** test lock-screen auto-next, Bluetooth remotes, and native queue on:
   - Development Client, or
   - EAS `preview` / `production` builds
2. Set `USE_NATIVE_TRACK_PLAYER = true` in `constants/playbackConfig.ts` for native queue tests.
3. Queue **10+ songs**, lock screen, wait for **3+ auto-advances** without unlocking.
4. Confirm console in dev client:  
   `Track Player service registered (development-client)`  
   **Not** `Expo Go — Track Player disabled`.
5. In Expo Go, expect:  
   `Expo Go — Track Player disabled; expo-av fallback active`  
   Playback may work; **native queue behavior is invalid for QA**.

---

## Expo Go fallback behavior

- Open project in **Expo Go** only for quick UI/layout checks.
- `supportsNativeTrackPlayer()` returns `false` → bridge uses **expo-av**.
- `index.js` does **not** call `registerPlaybackService` or `require('react-native-track-player')`.
- `playbackServiceRegistration.ts` uses runtime `require()` only after guards.
- **Do not** file playback regressions from Expo Go; reproduce on dev client.

---

## EAS profiles

| Profile | Use |
|---------|-----|
| `developmentClient` | Daily native dev binary (APK / iPhone internal) |
| `preview` | QA builds, stakeholders |
| `production` | Store release |

Env tag: `EXPO_PUBLIC_BUILD_PROFILE` is set per profile for runtime diagnostics.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Device cannot connect to Metro | Use default tunnel script; disable VPN on phone |
| “Track Player disabled” while testing native queue | You are in Expo Go — open Development Client |
| Native module error after git pull | Rebuild affected platform(s) |
| iOS install fails | Re-register device UDID; rebuild `build:dev-client:ios` |
| Android install blocked | Allow unknown sources; reinstall APK from EAS |

---

## Related files

- `hidden-tunes-app/index.js` — service registration guards
- `hidden-tunes-app/utils/expoRuntime.ts` — Expo Go vs dev client detection
- `hidden-tunes-app/constants/playbackConfig.ts` — Track Player feature flag
- `hidden-tunes-app/eas.json` — `developmentClient` profile (Android + iOS)
