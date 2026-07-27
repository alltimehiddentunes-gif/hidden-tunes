# Home content-first rebuild

## Root cause

1. **PlayerWorkspace hijack:** `selectAndPlay` always called `openSong()`, setting `activeView = 'song'`. Playing from Home replaced the centre discovery column with a full Now Playing workspace (Back / Fullscreen / giant art).
2. **Escaped artwork:** Global `.art-frame { position: absolute; inset: 0 }` had no bounded shell on Home rails. Song/album/room cards filled `.page-view` (~700×1600), looking like a faded full-page poster.

## Fixes

- Home `context === 'home'` plays via queue only; stays on discovery page; right/compact players update.
- `HomeArt` shells on every Home artwork; CSS bounds frames to rail/thumb/hero sizes.
- Denser content-first rails; hero max ~280px; Continue Listening resume rail when progress exists.

## Validation

See commit message / agent report.
