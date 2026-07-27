# Player Integration

## Previous placeholder ownership

- Right rail used `QueueUpNextPanel`, which returned `null` when idle and only showed an Up Next list when active.
- PSD Now Playing CSS remained but was not wired as a persistent player.
- Empty artwork initials could render `?` via `deriveEntityInitials`.

## Final player surface ownership

| Surface | Role |
|---------|------|
| `DesktopPersistentPlayer` | Primary persistent Now Playing rail (view only) |
| `TvNowPlayingPanel` | TV-nav right rail + shared video surface |
| `PlayerBar` | Compact footer secondary controls (same provider state) |
| `DesktopPlaybackProvider` | Sole playback / queue / mutex owner |

## Why no duplicate playback owner

`DesktopPersistentPlayer` only calls `useDesktopPlayback` / `useDesktopPlaybackProgress` and existing transport/queue components. It does not create audio/video elements or a second provider.

## Bottom player bar

**Retained** as a compact secondary view sharing the same state. Smoke confirmed one `.player-bar` and one persistent rail; not two full players.

## Stale-operation protection

Unchanged — still owned by `DesktopPlaybackProvider` media-switch / mutex paths. Right rail metadata follows `currentTrack` / capabilities atomically.
