# PODCASTS Audit (Desktop)

**Owners:** `PodcastsPage.tsx`, `PodcastShowPage.tsx`  
**Status:** Mostly complete · **80%**  
**Release ready:** Conditional

## Verified

| Area | Result |
|------|--------|
| Browse / search | Shows, categories, continue |
| Show / episodes | Metadata browse + episode lists |
| Metadata vs playable | Browse is metadata-rich; **playback is real** via `resolvePodcastPlayUrl` |
| Progress / duration / Queue | Supported on resolved episodes |
| Favourites / history | Typed local paths |
| UX defect | Featured play icon can open show (misleading affordance) |

## Verdict

Not a metadata-only trap overall — resolve-on-play is honest when URL missing. Visual polish incomplete.
