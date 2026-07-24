# Playback Ownership

## Single owner

**`DesktopPlaybackProvider`** owns:

- Audio element (`HtmlAudioPlaybackService`)
- Shared video element (`HtmlVideoPlaybackService` / TV mount)
- `currentQueue` / `currentIndex` / `currentTrack`
- Transport: play / pause / next / previous / seek / queue mutations

There is no parallel React queue context.

## Mutex expectations

| Surface | Rule |
| ------- | ---- |
| Player bar | At most one primary bar (`.player-bar` / `.player-center`) |
| Video | At most one `.ht-tv-video-element` / `video[data-ht-tv-playback]` |
| Family switch | Starting Sports/TV after Music (or Radio after video) transfers ownership — no duplicate live surfaces |

## Video path

`usesDesktopVideoPath`: TV, Sports, lecture video, motivational video share the single video element.

## Audio path

Music, radio, podcasts, audiobook chapters, and non-video motivational/lecture use the HTML audio service.

## Restore

On mount, `restoreQueueSongs()` hydrates the queue **paused** (`autoplay: false` diagnostic). Playback starts only from an explicit user/play action.
