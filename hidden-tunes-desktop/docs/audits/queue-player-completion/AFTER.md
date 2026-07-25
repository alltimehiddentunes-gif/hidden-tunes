# After (Phase 6 completion — recovery repair)

Final state after recovering committed WIP `3d49ff2` and applying requirement repairs:

- Typed queue families without `offline_audio` discriminator; downloads keep original family
- Centralized `resolvePlaybackCapabilities`
- Mature-gated queue restore (no autoplay)
- Unified 3s previous-restart threshold
- Editable-aware keyboard shortcuts on the single playback owner
- Queue panel: family / LIVE / Downloaded, clear / remove / reorder
- Library typed enqueue for Music / Radio / Episodes
- Live radio/TV progress (no fake `0:00 / 0:00`)
- Contract + Electron runtime harnesses
- Audit pack includes CAPABILITIES / OWNERSHIP / PERSISTENCE / WIP-REVIEW / RECOVERY-STATE
