# Music Page Repair — AFTER

**Start HEAD:** `c5809aa7a421e31f0f264f217c5f545488cc527b`
**Branch:** `desktop/integrate-home-music-split`

## Root cause (confirmed)

| Defect | Owner |
|--------|--------|
| Giant circular artwork | `ArtworkImage variant="circle"` in `MusicDiscoverPage` / `MusicSectionContent` (Featured Artists / Artists) with no relative shell |
| Escaped CSS | Global `.art-frame { position: absolute; inset: 0 }` filling `.page-view` |
| Oversized “poster” behind | Same absolute frames on featured release / genre tiles / uncontained square art |
| Search mojibake | `TOP_BAR_PLACEHOLDERS` in `App.tsx` (corrupt ellipsis bytes) |
| Catalogue replaced on Play | `selectAndPlay` only exempted `context === 'home'`; Music used `'discover'` → `openSong()` → PlayerWorkspace |

## Selectors / files changed

- Added `MusicArt` shell (`.music-art`, `--rail`, `--chip`, `--featured`, `--list`, `--circle`)
- Wrapped all Music Discover / section `ArtworkImage` usages
- `.detail-artwork { position: relative }` for intentional album detail containment
- `selectAndPlay`: `home \|\| discover` stays on page
- UTF-8 placeholders: `Search songs, artists, albums…` (and sibling top-bar strings)
- Song sections → bounded list rows; album year metadata; Artists deep-browse link
- Bottom padding: `.main-scroll:has(.page-view[data-page="music"])`

Home `.music-home-art*` untouched.

## Artwork dimensions (AFTER Electron)

| Width | maxH | giant | placeholder |
|-------|------|-------|-------------|
| 1024 | 190 | false | `Search songs, artists, albums…` |
| 1280 | 190 | false | clean UTF-8 |
| 1440 | 190 | false | clean UTF-8 |
| 1720 | 190 | false | clean UTF-8 |

Song list art: 56×56. Album/release rail: ≤190 square. Artist circle: ≤160 via `.music-art--circle`. Featured: 88×88.

## Playback / route

- Play from Music Discover stays on `.music-discover` (no `.player-workspace-back`)
- Persistent player + compact player remain single owners
- Album/artist open remain intentional detail views with Back

## Screenshots

- `BEFORE.png`
- `AFTER-1024.png` / `AFTER-1280.png` / `AFTER-1440.png` / `AFTER-LARGE.png`
