# Podcast & Radio — Runtime Results

Date: 2026-07-22  
Harness: `scripts/validate-podcast-radio-runtime.mjs`  
Renderer: Vite `http://localhost:5173` + Electron preload/catalog IPC  
JSON: `runtime-results.json`  
Screenshots: `screenshots/`

## Summary

**19/19** Electron harness checks passed after contract hardening.

## Podcast

| Test | Result | Notes |
| --- | --- | --- |
| Page load | PASS | 12 show cards; no blocking error |
| No “Failed to load latest episodes” | PASS | Unscoped episodes call removed |
| Search `jazz` | PASS | 3 show cards |
| Show detail | PASS | 161 episode rows rendered |
| Play attempt | PASS | Player bar present; audio path engaged |
| Unscoped episode list requests | PASS | None observed via catalog IPC |
| Episode `q=` search requests | PASS | None observed |

## Radio

| Test | Result | Notes |
| --- | --- | --- |
| Page load | PASS | `.radio-destination`, 32 stations |
| Search `jazz` | PASS | Jazz stations listed; no Sex Sound |
| Search `Sex Sound Radio` | PASS | 0 cards (mature filtered) |
| Play attempt | PASS | `audioPlaying=true` |
| Music → Radio → Podcasts | PASS | Navigation round-trip |

## Playback ownership (observed)

| Transition | Result |
| --- | --- |
| Podcast episode play | Single audio owner via existing provider |
| Radio station play | Single audio owner; `audioPlaying=true` |
| Music ↔ Radio ↔ Podcasts nav | No harness evidence of duplicate audio |

Protected systems (`DesktopPlaybackProvider`, HtmlAudio/Video, mutex, Player Bar) were **not** rewritten.

## Search / cancellation

| Behavior | Evidence |
| --- | --- |
| Debounced search | Podcast/Radio hooks use 280ms debounce |
| Stale overwrite | Request id + AbortController; AbortError not surfaced as fatal |
| Rapid typing | Contract + hook design; Electron typed discrete queries |

## Performance (approximate, production probes)

| Operation | Time |
| --- | --- |
| Podcast shows page | ~0.2s |
| Podcast category episodes | ~0.5s |
| Unscoped episodes (avoided) | ~8s then 500 |
| Radio browse page | ~0.7–1.0s |
| Radio search | ~0.7s |
| Station `/play` | ~0.2–0.4s |
| Catalog size on mount | Bounded page (≤32–40), not full 35k |

## Limitations

- Player bar title sometimes empty in harness while audio is playing (metadata timing).
- Radio UI still lacks load-more pagination (backend page 2 works; P2).
- Full mature radio settings / age confirmation UI not built (mature excluded by default).
- Podcast favorites not in scope.
