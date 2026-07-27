# Home + Persistent Player — OWNERSHIP

## Single owners (must remain)

| Concern | Owner | Notes |
|---------|--------|-------|
| Playback state / mutex | `DesktopPlaybackProvider` | Only playback owner |
| Audio element | Existing desktop audio service inside provider | Do not add another |
| TV/Sports video | `acquireTvVideoPlaybackService` + `TvVideoSurface` | Right panel may show metadata/controls; TV nav keeps `TvNowPlayingPanel` as video surface |
| Queue state | Same provider (`currentQueue`, ops) | `PlayerQueuePanel` is a view |
| Progress / duration | `useDesktopPlaybackProgress` | Separate subscription from metadata |
| Volume / mute | Provider `volume` / `setVolume` | Shared with bar and rail |
| Capabilities | `resolvePlaybackCapabilities` | Family-truthful seek/live |
| Metadata / artwork | `resolvePlayerShellMetadata` + track fields | Atomic with active identity |

## UI surfaces over the same state

| Surface | Role after this task |
|---------|----------------------|
| `DesktopPersistentPlayer` | Primary desktop Now Playing rail (view only) |
| `PlayerBar` | Compact secondary footer; same state; retained until rail proven |
| `PremiumFullscreenShell` | Optional full overlay; same state |
| `TvNowPlayingPanel` | TV-nav right rail including shared video surface |
| `PlayerQueuePanel` | Queue list view inside rail |

## Navigation ownership

| Surface | Role |
|---------|------|
| Left `Sidebar` | Authoritative app navigation |
| `GlobalTopNav` | Compact page chrome only (brand / profile) — no duplicate route list |
| `HomeTopBar` | Universal search + page header controls |

## Must not introduce

- Second `DesktopPlaybackProvider`
- Second audio or video element for general playback
- Page-specific playback engines
- Duplicate full player bar beside the full right rail (footer stays compact)
