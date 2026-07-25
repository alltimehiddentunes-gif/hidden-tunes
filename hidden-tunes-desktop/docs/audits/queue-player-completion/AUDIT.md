# Queue / Player Completion — Audit

Phase 6 hardens the single desktop playback owner, typed queue contract, Up Next management UI, mature auto-advance skip, download family preservation, capability resolver, and runtime validation.

## Owner

**`DesktopPlaybackProvider`** is the single playback owner. There is no second queue provider. TV / Sports use the shared video path inside the same provider; they are not persisted into the typed audio queue.

## Scope completed

| Area | Status |
| ---- | ------ |
| Typed queue module (`src/lib/queue`) | Done |
| Persistence `ht-desktop:queue:v1`, max 500, restore paused | Done |
| Downloads keep original family | Done (repaired) |
| Capability resolver | Done |
| Duplicate policy (playNow / enqueue) | Done |
| Active remove → promote next + play | Done |
| Previous threshold 3s (all finite families) | Done |
| Seek rejected for radio / TV / sports | Done |
| Queue panel clear / remove / reorder | Done |
| Mature auto-advance + restore gating | Done |
| Editable-aware keyboard | Done |
| Runtime harness ≥ 30 checks | Done |

## Evidence

- `QUEUE-CONTRACT.md`, `CAPABILITIES.md`, `OWNERSHIP.md`, `PERSISTENCE.md`
- `PLAYBACK-OWNERSHIP.md`, `SOURCE-ROUTING.md`, `CONTROLS.md`, `AUTO-ADVANCE.md`
- `VALIDATION.md`, `BEFORE.md`, `AFTER.md`, `WIP-REVIEW.md`, `RECOVERY-STATE.md`
- `runtime-results.json` — Electron DOM evidence

## Gaps / soft passes

- Catalog-empty soft-passes when Music / Radio rows do not load in the validation Electron session.
- Desktop mature-access UI is still a later Settings concern; gate defaults closed via `ht-desktop:mature-library-access`.
- Restored queue hydrates `currentQueue` but does not set `currentTrack` — Up Next rail stays hidden until playback starts (by design: restore paused).
