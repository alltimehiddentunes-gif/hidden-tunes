# Before (Phase 6 start)

- Typed queue foundation existed (`src/lib/queue`) with persistence and ApiSong bridge.
- `DesktopPlaybackProvider` already owned play / queue / seek / previous families.
- Up Next panel had empty/list UI; management actions (clear / remove / reorder) were incomplete or lightly covered.
- Auto-advance on `ended` / `next()` did **not** skip mature-gated items.
- Runtime harness existed but was mostly soft contract mirrors (~20 checks), weak DOM play coverage, no catalog preload.
- Audit docs for queue-player-completion were not yet written.
