# Queue / Player Completion — Audit

Phase 6 hardens the single desktop playback owner, typed queue contract, Up Next management UI, mature auto-advance skip, and runtime validation.

## Owner

**`DesktopPlaybackProvider`** is the single playback owner. There is no second queue provider. TV / Sports use the shared video path inside the same provider; they are not persisted into the typed audio queue.

## Scope completed

| Area | Status |
| ---- | ------ |
| Typed queue module (`src/lib/queue`) | Done |
| Persistence `ht-desktop:queue:v1`, max 500, restore paused | Done |
| Duplicate policy (playNow / enqueue) | Done |
| Active remove → promote next + play | Done |
| Previous thresholds by family | Done |
| Seek rejected for radio / TV / sports | Done |
| Queue panel clear / remove / reorder | Done |
| Mature auto-advance skip on `ended` + `next()` | Done |
| Runtime harness ≥ 30 checks | Done |

## Evidence

- `QUEUE-CONTRACT.md` — identity, ops, caps
- `PLAYBACK-OWNERSHIP.md` — single owner + mutex
- `SOURCE-ROUTING.md` — family resolvers
- `CONTROLS.md` — previous / seek / queue UI
- `AUTO-ADVANCE.md` — end / next / mature skip
- `VALIDATION.md` — commands + results
- `BEFORE.md` / `AFTER.md` — deltas
- `runtime-results.json` — Electron DOM evidence

## Gaps / soft passes

- Catalog-empty soft-passes when Music / Radio rows do not load in the validation Electron session.
- Desktop has no mature-access UI yet; gate defaults closed via `ht-desktop:mature-library-access`.
- Restored queue hydrates `currentQueue` but does not set `currentTrack` — Up Next rail stays hidden until playback starts (by design: restore paused).
