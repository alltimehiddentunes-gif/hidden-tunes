# Phase 1 — Installed binary proof (EAS + Git)

Captured: 2026-07-25 (agent runtime)
Workspace HEAD: `f8cc5fedcc81162185407fad54efb22cbc42fad0`
Branch: `fix/library-content-type-safe`

## EAS iOS builds (newest first)

| EAS Build ID | Profile | Dist | App | Build # | Git commit | Created (UTC) |
|---|---|---|---|---|---|---|
| `d4d13cfc-ffd0-4c4e-9752-a0a368fb1305` | **production** | STORE | 1.0.1 | **1.0.189** | **`f8cc5fed…`** | 2026-07-25T18:24:02Z |
| `e90742b0-c677-4f77-8ded-97664474475d` | **developmentClient** | INTERNAL | 1.0.1 | 1.0.188 | `38c36fab…` | 2026-07-25T14:34:24Z |
| `5bd96dae-6542-48e9-a33b-2d12d6d493f5` | developmentClient | INTERNAL | 1.0.1 | 1.0.188 | `38c36fab…` | 2026-07-22T17:59:37Z |

## Native API presence by commit

| Commit | `setPresentedNowPlaying` in `HiddenAudioModule.m` |
|---|---|
| `f8cc5fed…` | **Present** |
| `38c36fab…` (latest Dev Client) | **Absent** |

## Implications for Metro diagnosis

- Metro + **developmentClient** on this account currently means native binary from **`38c36fab`**, not `f8cc5fe`.
- The only EAS iOS artifact built from **`f8cc5fed…`** is the **production/store** build `d4d13cfc…` (1.0.1 / 1.0.189).
- Production/TestFlight does **not** attach to Metro `__DEV__` logs (`[HTTVMediaSession]` is `__DEV__`-gated).

## Device connection (this machine)

- Windows host; Apple iPhone appears as WPD device (`Unknown` status).
- No `idevice_id` / `xcrun` available here for reading CFBundleVersion from the phone.
- Metro is listening at `http://localhost:8081` for a Dev Client session.

## Required device-side confirmation (user)

On the phone, report which app is open:

1. **Expo Dev Client** (opens Metro / QR) → almost certainly build **1.0.188** / git **`38c36fab`**
2. **Hidden Tunes** from TestFlight / App Store Connect (1.0.1 / **1.0.189**) → git **`f8cc5fed`**

Profile screen shows app version via `Constants.expoConfig?.version`.
