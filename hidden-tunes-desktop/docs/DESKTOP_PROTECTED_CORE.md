# Hidden Tunes Desktop — Protected Core

Established for final completion sprint: 2026-08-07  
Workspace: `D:\HiddenTunes\Active\HiddenTunes-Desktop`  
Baseline branch: `desktop/integrate-home-music-split`  
Release source parent: `14e96b275943cbcf8f44b5020455db46fde24c8d`
Release commit: the commit containing this document, titled `release(desktop): freeze Hidden Tunes Desktop 1.0.0`

These boundaries are release invariants. A protected component may change only for a reproduced defect, with a narrow diff and focused regression proof. Broad refactors, parallel owners, and unrelated interception are forbidden.

## Desktop playback invariants

| Protected system | Authoritative implementation | Invariant |
|---|---|---|
| Playback provider | `src/context/DesktopPlaybackProvider.tsx` | One renderer media-session owner |
| Audio service | `src/lib/desktopPlayback/HtmlAudioPlaybackService.ts` | One `HTMLAudioElement` owner |
| Video service | `src/lib/tv/HtmlVideoPlaybackService.ts` | One persistent `<video>` owner |
| Central queue | Playback provider + `src/lib/desktopPlayback/*` | One queue owner and canonical typed identities |
| Auto-Next | Playback provider + `smartContinuation.ts` | One bounded ended-event state machine |
| Compact-first playback | `App.tsx`, `PlayerBar`, player launch controls | Playback never auto-opens an expanded shell |
| Full player | `PremiumFullscreenShell.tsx` | One canonical expanded presentation |
| TV ownership | Provider + shared video service + `TvNowPlayingPanel` | Collapse/navigation never creates or restarts a second stream |
| Media mutex | Provider | Audio stops for video; video stops for audio |

Required regression gates after any protected playback edit:

- `test-auto-next-smart-queue.mjs` — 47/47
- `verify-playback-mutex.mjs`
- `verify-media-session-contract.mjs`
- `verify-queue-contract.mjs`
- `verify-video-surface.mjs`
- `verify-unified-fullscreen-contract.mjs`
- real Electron playback for the affected family

## Backend catalog/upload invariants

| Protected system | Authoritative implementation | Invariant |
|---|---|---|
| Admin upload route | `hidden-tunes-admin/app/api/admin/upload-track/route.ts` | Canonical protected `POST /api/admin/upload-track` owner |
| Local server routing | `hidden-tunes-backend/server.js` | Must not redirect canonical upload-track into compatibility handling |
| Compatibility router | `hidden-tunes-backend/routes/adminUploadCompatibility.js` | Must not register `/api/admin/upload-track`; failures never return unexplained empty 200 |
| Upload transaction | canonical route and upload services | Song exactly once; correct artist/album; bounded cleanup and idempotency |
| R2 upload | `hidden-tunes-admin/lib/r2.ts` and upload route | No unrelated changes or deletion of unproven/reused objects |
| Supabase identity | song/artist/album persistence | Canonical relations and duplicate prevention |
| Mature gates | catalog filters, admin/public policies | No bypass or fallback leakage |
| Authentication | permission middleware and admin security | No weakening of auth, role, CORS, or rate-limit gates |

Local protected-upload regression status on 2026-08-07:

- `test-admin-upload-compatibility.mjs`: PASS
- `test-admin-upload-failure-matrix.mjs`: PASS (15 failure/idempotency boundaries)
- `test-admin-server-integration.mjs`: PASS
- `test-admin-catalog-security.mjs`: PASS

Production verification remains intentionally **not run** because it creates production song/artist/album metadata. Explicit production-mutation authorization is required. Until the required HTTP 200 JSON response and exactly-once relations are observed, the installed release gate remains blocked.

## Cross-platform systems frozen during this sprint

- mobile workspace
- HiddenAudio
- CarPlay
- Android Auto
- Smart TV workspace
- Website workspace

Desktop completion work must not modify these systems. Cross-platform contract checks may read them without mutation.

## Change protocol

1. Reproduce and record the exact defect.
2. Identify the current owner; do not add another owner.
3. Make the smallest repair in the authoritative layer.
4. Run focused static and real-runtime regression proof.
5. Record changed files and evidence in the phase report.
6. Do not stage or commit until the installed Windows release passes.
