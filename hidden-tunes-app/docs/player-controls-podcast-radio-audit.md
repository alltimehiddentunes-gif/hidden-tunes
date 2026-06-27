# Player Controls — Podcast & Radio Audit

**Date:** 2026-06-27  
**Scope:** Podcast on-demand controls, live radio stream controls, shared PlayerContext/MiniPlayer/full player UI.

---

## Architecture

```text
Podcast show / category tap
        │
        ▼
playbackRouter.routePodcastPlayback (standard queue mode)
        │
        ▼
PlayerContext.playQueue → HiddenAudio / TrackPlayer

Radio station tap (category list)
        │
        ▼
playbackRouter.routeRadioPlayback (live_stream mode + station queue)
        │
        ▼
PlayerContext.playQueue → live stream playback
```

Music playback path is unchanged.

---

## Playback surface modes

| Mode | Detection | Queue mode | Seek | Auto-next smart extend |
|------|-----------|------------|------|------------------------|
| Music | default | `standard` | yes | yes (when enabled) |
| Podcast | `source/type === podcast` | `standard` | yes | no — bounded queue |
| Live radio | `source/type === live_stream` | `live_stream` | blocked | no — bounded queue |

Helpers: `utils/playbackMode.ts` (`getPlaybackSurfaceMode`, `isBoundedQueuePlayback`).

---

## PlayerContext additions

| Action | Podcast | Live radio | Music |
|--------|---------|------------|-------|
| `togglePlayPause` | pause/resume position | pause; resume reconnects stream | unchanged |
| `seekTo` | yes | no-op | yes |
| `seekRelative` | ±15s / +30s from UI | no-op | yes |
| `replayCurrentTrack` | seek to 0 + play | reload stream | seek to 0 + play |
| `nextSong` / `previousSong` | queue navigation | queue navigation when multi-station | unchanged + repeat/shuffle |
| Auto-next on finish | yes (standard queue) | skipped (live) | unchanged |

Podcast episodes use **standard** `activeQueueMode` (not a separate podcast queue mode).

---

## Full player UI (`app/(tabs)/player.tsx`)

### Podcast

- Episode title + show name (artist field)
- Artwork, seek bar, waveform
- −15s / +30s chips
- Play/pause, next/previous (when queue has items)
- Replay (restart episode)
- Shuffle/repeat hidden (music-only)

### Live radio

- Station name + subtitle
- LIVE badge
- Seek bar and waveform hidden
- Play/pause (reconnect on resume)
- Replay = reconnect stream
- Next/previous only when `activeQueue.length > 1`
- Shuffle/repeat hidden

---

## MiniPlayer

- LIVE / Podcast badges
- Progress hidden for live radio (label only)
- Next skip when queue has a following item (podcast + multi-station radio)
- Play/pause unchanged

---

## Radio station queue

`routeRadioPlayback` accepts optional `stationQueue`. Category station lists pass loaded stations so next/previous can move between stations in the same room without extra fetches.

Single-station tune-in (detail screen) keeps a one-item queue — next/previous disabled.

---

## Regression checklist

- [ ] Music play/seek/next/previous/shuffle/repeat
- [ ] Podcast play/pause/resume/replay/seek/skip chips/next/prev/auto-next
- [ ] Radio play/pause/resume/reconnect/replay/no seek/multi-station skip
- [ ] MiniPlayer visible and stable
- [ ] `live_stream` mode preserved for radio
- [ ] Mature radio rooms unchanged

---

## Files touched

- `context/PlayerContext.tsx` — replay, relative seek, live reconnect, bounded queue guards
- `context/playerContextSlices.ts` — new actions exported
- `services/playback/playbackRouter.ts` — standard podcast queue, radio station queue
- `hooks/usePlaybackRouter.ts` — radio queue param
- `app/stations/[categoryId].tsx` — pass station queue
- `app/(tabs)/player.tsx` — mode-aware controls
- `components/MiniPlayer.tsx` — queue-aware next
- `components/player/PlaybackSeekChips.tsx` — podcast skip chips
- `utils/playbackMode.ts` — shared mode detection
