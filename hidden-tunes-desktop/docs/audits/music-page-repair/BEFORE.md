# Music Page Repair — BEFORE

**HEAD:** `c5809aa7a421e31f0f264f217c5f545488cc527b`

## Capture metrics (Electron 1440×900)

From `BEFORE-metrics.json` / console:

- `giant=false` on Discover without Featured Artists loaded in that run (`maxH=88` — featured release CSS size only)
- Placeholder mojibake confirmed: `Search songs, artists, albums├óÔé¼┬ª`
- Sections present: New Releases | Popular on Hidden Tunes | Genres | Moods | Deep browse
- Screenshot: `BEFORE.png`

User screenshot / Artists path still shows page-filling circular art when Featured Artists or Artists section mounts without a relative shell.

## Root causes

### 1. Giant circular artwork
- **Component:** `ArtworkImage` with `variant="circle"` in `MusicDiscoverPage` (Featured Artists) and `MusicSectionContent` (Artists).
- **CSS:** global `.art-frame { position: absolute; inset: 0 }` with **no** bounded shell.
- **Containing block:** `.page-view { position: relative }` → frames fill the entire Music centre column.
- Artist chips (`.music-discover-artist-chip`) had no `position: relative`.

### 2. Oversized square “poster” behind
- Same escape for square `ArtworkImage` on featured release and genre tiles (no relative shell).
- Release cards had `position: relative` so they were less severe; stacked uncontained frames still look like a full-page poster.

### 3. Catalogue hidden
- Opaque escaped art covers rails; and/or Play uses `context: 'discover'` which still called `openSong()` → `PlayerWorkspace` replaces Music.

### 4. Search placeholder mojibake
- `TOP_BAR_PLACEHOLDERS.music` in `App.tsx` stored corrupted UTF-8 ellipsis (`├óÔé¼┬ª` instead of `…`).

## Selector chain

```
.page-view[data-page="music"]
  … .music-discover-artist-chip | .music-discover-*-hit
    .art-frame.art-frame--circle | .art-frame--square
      → absolute inset 0 → fills .page-view
```

## Architecture note

Home already fixed via `HomeArt` + `context === 'home'`. Music must mirror that pattern without changing Home.
