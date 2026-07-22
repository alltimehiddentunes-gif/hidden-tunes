# Home vs Music — Runtime Validation

## Tested commit

```text
60d813ab48d48f40b5fd5e8fbb129f42ba8e8a53
```

Branch: `desktop/home-music-responsibility-split`  
Worktree: `C:\Users\Wills\Desktop\HiddenTunes-home-music-split`

Protected tag untouched: `desktop-protected-baseline-2026-07-21` → `535b1a7`

## Runtime command

```text
# Terminal A
npm.cmd run dev:vite

# Terminal B
.\node_modules\.bin\electron.cmd scripts\validate-home-music-runtime.mjs
```

- Electron entry (product): `electron/main.js` (default window 1680×1024, **minWidth 1280**)
- Validation harness: `scripts/validate-home-music-runtime.mjs` — real Electron + same preload/catalog IPC + Vite renderer at `http://localhost:5173`
- Vite: `npm run dev:vite` → `http://localhost:5173`
- Production music catalog API: `https://hidden-tunes-api.onrender.com`
- Admin catalog IPC base: `https://admin.hiddentunes.com`

Harness temporarily lowers `minWidth` to **760** so 1024 / narrow layouts can be exercised. Product `electron/main.js` still enforces **minWidth 1280** for normal `npm run dev`.

Isolated Electron `userData` temp profile used (no production profile mutation).

## Automated result

```text
61 passed, 0 failed
```

Machine-readable: `results.json`

## Window sizes tested

| Name | Size |
|------|------|
| 1440 | 1440×960 |
| 1280 | 1280×860 |
| 1024 | 1024×800 |
| narrow | 900×760 |

## Home validation

Observed section order (empty isolated profile):

```text
Home heading
Jump In
```

Continue / Recently Played omitted cleanly (no history).

After empty-history clear (post play attempt):

```text
Home
Made for You   (catalog fallback mix)
Hidden Gems
Jump In
```

Confirmed absent at all widths:

- giant hero
- recently added / artists / albums / genres / moods / editorial rails
- Explore More large grid
- dead filter button
- horizontal overflow

Jump In: 7 compact chips. Sidebar + Player Bar present.

## Music validation

Observed Discover headings:

```text
Browse the catalog
New Releases
Popular on Hidden Tunes
Genres
Moods
Deep browse
```

Confirmed at all widths:

- **Main Sidebar remains visible** (`app-shell--music` no longer hides it)
- Music SubNav secondary (Downloads absent)
- No Home-derived hero / My Music Mix / Made for You / Recently Played / Hidden Gems
- Featured release compact
- 3 deep-browse links (Songs / Albums / Playlists)
- At 1024px SubNav wraps horizontally cleanly
- No horizontal overflow

## Playback continuity

Playback item attempted:

```text
DEV Audio Versions: All Tiers by Hidden Tunes QA
```

Findings:

- Click registered; Player Bar / Now Playing shell showed track metadata
- Exactly **one** `<audio>` and **one** `<video>` element throughout
- Queue metadata appeared in UI after navigation (multiple DEV Audio Versions entries visible in player workspace copy)
- `audio.playing === false` in DOM probes — likely stream/harness limitation for QA catalog tracks, not a Home/Music split remount
- Navigation Home ↔ Music ↔ SubNav Artists/Albums/Songs did not create a second audio element
- Continuity of *audible* streaming not proven for these QA tracks

## Queue / catalog

| Check | Result |
|-------|--------|
| Catalog HTTP fetches on first load | 3 (`/api/albums`, `/api/songs`, `/api/artists`) |
| Extra full catalog fetches on Home↔Music | **0** (`delta=0`) |
| Shared CatalogProvider | Confirmed by zero refetch on nav |

## Empty history

Isolated profile + `localStorage` clear of `ht-desktop:music-*` keys:

- No blank hero
- Jump In remains
- Made for You / Hidden Gems appear when catalog fallback applies
- No empty card shells / runtime crash

## Console

- 2 renderer console error-level entries captured (see `results.json`)
- Electron deprecation warning for `console-message` listener API (harness only)

## Screenshot index

| File | Content |
|------|---------|
| `home-1440.png` | Home @ 1440 (Jump In only on fresh profile) |
| `home-1280.png` | Home @ 1280 |
| `home-1024.png` | Home @ 1024 |
| `home-narrow.png` | Home @ 900 |
| `music-1440.png` | Music Discover @ 1440 + sidebar |
| `music-1280.png` | Music @ 1280 |
| `music-1024.png` | Music @ 1024 (SubNav wrapped) |
| `music-narrow.png` | Music @ 900 |
| `home-empty-history.png` | Home after history clear |
| `playback-home-to-music.png` | After Home↔Music nav during play attempt |
| `results.json` | Full automated check log |

## Fixes

None required. No product source changes from this validation pass.

## Known limitations

1. Product Electron `minWidth: 1280` — widths below that are harness-only.
2. Audible playback / resume-seconds not fully proven on DEV Audio Versions QA tracks.
3. Catalog failure / offline retry not simulated in this pass (network remained available).
4. Memory/CPU leak analysis not performed (no controlled profiler run).

## Verdict

**Home and Music split validated with minor limitations** (audible stream continuity and production minWidth vs harness narrow widths).
