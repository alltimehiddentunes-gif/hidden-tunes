# Workspace Proof — Desktop Launch Readiness Audit

**Audit date:** 2026-08-01  
**Mode:** AUDIT ONLY — no source commits, no push, no deploy, no history rewrite  
**Dirty work:** Left untouched (81 dirty paths under `hidden-tunes-desktop/` at audit time)

---

## Authoritative workspace

| Field | Value |
|-------|-------|
| Workspace path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Drive | `D:` |
| Volume label | `llordwills` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| App package path | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |

**Verdict:** Matches expected SSD authoritative Desktop workspace. Audit proceeded.

---

## Desktop package identity

| Field | Value |
|-------|-------|
| Package name | `hidden-tunes-desktop` |
| Product name | Hidden Tunes Desktop |
| Declared version | `0.0.1` |
| Package manager | npm (`package-lock.json`) |
| Electron (installed) | `42.2.0` |
| React (installed) | `19.2.6` |
| Vite (installed) | `8.0.14` |
| TypeScript | `~6.0.2` |
| Main entry | `electron/main.js` |

### Build scripts (`package.json`)

| Script | Command |
|--------|---------|
| `dev` | concurrently Vite + Electron |
| `dev:vite` | `vite` |
| `dev:electron` | `wait-on http://localhost:5173 && electron .` |
| `build` | `tsc -b && vite build` |
| `dist` | `npm run build && electron-builder` |
| `lint` | `eslint .` |
| `preview` | `vite preview` |
| `verify:*` | tv-hls, lecture-play, playback-mutex, video-surface, recently-added, route-media, electron-security, premium-honesty, motivational-video-layout, music-home |

### Packaging

- Target: NSIS Windows installer via `electron-builder`
- Artifact present: `release/Hidden Tunes Desktop Setup 0.0.1.exe` (~107.5 MB, dated 2026-07-30)
- **No** `electron-updater` dependency
- **No** `publish` config in `package.json`

---

## Mobile reference (behavioural benchmark)

| Field | Value |
|-------|-------|
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `9944c315b58ada61ccaee4364defd626624f7f9d` |
| Known incomplete (product) | Sports fixture streams gated off (`sports_streams_enabled: false`); CarPlay engineering surface exists |

Desktop sibling rule respected: Desktop audited here; mobile used only as reference, not modified.

---

## Git status snapshot (audit-time)

- Clean release baseline: **No** — large dirty worktree
- Modified + untracked under `hidden-tunes-desktop/`: **81** status lines
- Includes WIP in: `App.tsx`, `App.css`, Electron main/preload, playback/player/TV/podcasts/lectures/downloads libs, premium honesty module, verify scripts, prior audit folders
- Backend admin also dirty (out of Desktop app packaging scope for this audit)

**Launch implication:** Do not ship installer/artifacts from this dirty tree without an explicit freeze + commit of intended launch contents.
