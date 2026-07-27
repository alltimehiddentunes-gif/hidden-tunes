# Home content-first — AFTER

## Root causes fixed

1. **PlayerWorkspace hijack** — Home plays used `selectAndPlay` → `openSong()` → centre became a full Now Playing page.
2. **Escaped `.art-frame`** — absolute/inset artwork without shells filled `.page-view` (~700×1600).

## Fixes

- `context === 'home'`: play only; stay on discovery; update persistent + compact players.
- `HomeArt` shells on every Home image; CSS bounds rail/thumb/hero.
- Content-first density: tighter gaps, hero ≤240px, Recently Added elevated above the fold after family shortcuts.

## Diagnostics

| Check | Before | After |
|-------|--------|-------|
| Giant art frames | true (722×1649) | false (≤148) |
| Hero height | player workspace | ~234px |
| Home stays after play | no | yes |
| Sections in DOM | none (workspace) / sparse | Recently Added, Emotional Worlds, … All Songs |

## Screenshots

- `BEFORE.png` — centre is PlayerWorkspace / giant art
- `AFTER.png` — discovery Home with bounded hero + rails
