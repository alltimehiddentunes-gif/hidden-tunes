# Phase 6 WIP review

Recovery audited committed tree `3d49ff2` (inherited Phase 6 WIP that was already committed before this task). Classifications below apply to that inheritance plus recovery repairs.

| File | Decision | Reason |
| ---- | -------- | ------ |
| `src/lib/queue/types.ts` | **Repair** | Removed `offline_audio` as a live discriminator; downloads keep original family. Legacy constant retained for migration. |
| `src/lib/queue/family.ts` | **Repair** | Stopped remapping downloads to `offline_audio`. Local marker is `localDownloadId` / tags only. |
| `src/lib/queue/identity.ts` | **Keep** | Stable `type:id` identities. |
| `src/lib/queue/operations.ts` | **Keep** | playNow / enqueue / remove / move / clear match Phase 6 policies. |
| `src/lib/queue/persistence.ts` | **Repair** | Added legacy `offline_audio` → original-family migration; still never autoplays. |
| `src/lib/queue/apiBridge.ts` | **Keep** | Bridges typed store ↔ ApiSong without a second provider. |
| `src/lib/queue/diagnostics.ts` | **Keep** | Lightweight diagnostics. |
| `src/lib/queue/index.ts` | **Repair** | Export capabilities + local-download helpers. |
| `src/lib/queue/capabilities.ts` | **Keep** (added) | Centralized capability resolver required by Phase 6. |
| `src/context/DesktopPlaybackProvider.tsx` | **Repair** | Mature-gated restore; unified 3s previous threshold; editable-aware keyboard; capabilities for previous. Still single owner. |
| `src/components/player/PlayerShellPanels.tsx` | **Repair** | Family + Live + Downloaded labels via capabilities; no second player bar. |
| `src/components/library/DesktopLibraryPage.tsx` | **Keep** | Legitimate typed enqueue for Music / Radio / podcast episodes only; does not flatten Library. |
| `src/lib/desktopPlayback/types.ts` | **Keep** | Adds queue actions to existing action surface. |
| `src/App.tsx` | **Keep** | Live radio progress (no `0:00/0:00`); single PlayerBar. |
| `src/App.css` | **Keep** | Scoped queue panel / library enqueue styles. |
| `scripts/verify-queue-contract.mjs` | **Repair** | Dropped offline_audio identity checks; added capabilities / download-family / keyboard / mature-restore assertions. |
| `scripts/validate-queue-runtime.mjs` | **Keep** | Electron DOM harness (≥30). |
| Audit docs under `docs/audits/queue-player-completion/` | **Repair** | Align with final architecture; add required CAPABILITIES / OWNERSHIP / PERSISTENCE / recovery docs. |

## Architecture verdict

| Concern | Finding |
| ------- | ------- |
| Second playback owner | **No** — still `DesktopPlaybackProvider` only |
| Second player bar | **No** |
| Second queue provider | **No** — `src/lib/queue` is a typed module, not a React provider |
| TV/Sports shared video | **Preserved** via `usesDesktopVideoPath` |
| Playback mutex | **Preserved** |
| Downloads family | **Was wrong** (`offline_audio`); **repaired** to original family |
| Library conflation | **No** — enqueue is family-explicit |
| Radio fake duration | **No** — LIVE progress path |
| Auto-advance | Finite `ended` only + mature walk; live families `autoAdvance: false` |

## Library decision

`DesktopLibraryPage` Queue button is **required** for Phase 6 queue integration. It only enqueues Music / Radio / podcast episodes with typed adapters. Other Library types remain open-to-play. **Keep.**
