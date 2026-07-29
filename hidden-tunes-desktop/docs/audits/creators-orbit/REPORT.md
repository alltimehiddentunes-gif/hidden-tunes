# Creators In Your Orbit — fix audit

## Workspace / Git
- Workspace: `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration`
- Branch: `desktop/integrate-home-music-split` (unchanged)
- HEAD: `99b3e248a8376e9715c20d9f76ffa9cb06266082`
- No commit / push / deploy

## Exact source
| Piece | Location |
|--------|----------|
| Label | `HOME_UI.sections.creatorsInOrbit` in `src/lib/home/mobileHomeParity.ts` |
| Builder | `buildCreatorsInOrbit` (was `artists.slice(0, 8)`) |
| Render | `src/components/home/MusicHomePage.tsx` creators section |
| API | Express `GET /api/artists?page=1&limit=40` (+ nested `tracks`) |
| Song indexes | Built from songs page via `buildCatalogIndexes` |
| Count UI (old) | `songsByArtistId` / `songsByArtistName` only → defaulted to `0` |
| Cache | No dedicated creators cache. Derived at render. Music page cache `v2` unchanged. |

## First incorrect point
1. `buildCreatorsInOrbit` selected the first N A–Z artists with **no playable eligibility**.
2. Song count ignored `resolveSongsForArtist` (which falls back to `artist.tracks`) and printed `"0 songs"` when the songs-page index had no overlap.

## Why counts were zero
| ID | Name | Type | Associated / playable | Indexed | Zero reason |
|----|------|------|------------------------|---------|-------------|
| `2da7464d-…` | Acoustic Time | artist | 89 / 89 | 0 | index-only UI count |
| `aa37b42a-…` | Aether Stream | artist (empty) | 0 / 0 | 0 | genuinely empty |
| `241848cb-…` | Amara Skies | artist | 17 / 17 | 0 | index-only UI count |
| `fa5122e5-…` | Ann Lyen | artist | 18 / 18 | 0 | index-only UI count |
| `17ab3236-…` | Authentic Portuguese Fado | artist (empty) | 0 / 0 | 0 | genuinely empty |
| `9aed264e-…` | Bazmhent | artist (empty) | 0 / 0 | 0 | genuinely empty |
| `df9d9e29-…` | Best Love country music | artist (empty) | 0 / 0 | 0 | genuinely empty |
| `a59cde2c-…` | Bhoho X | artist | 10 / 10 | 0 | index-only UI count |

Raw proof: `docs/audits/creators-orbit/raw-creators-audit.json`

## Fix
- Eligibility via `resolveSongsForArtist` + `selectInstantPlayableUrl` + exclude internal/dev songs.
- Personalisation **after** eligibility (history affinity + playable volume).
- Dedupe by normalised name.
- UI uses `formatSongCountLabel(..., { omitZero: true })`; section still hide-if-empty.
- Hardened `buildAlbumsWorthStayingWith` default `indexes.artistNames` access (was crashing Home when indexes/names were missing).

## Files changed (this task)
- `src/lib/home/mobileHomeParity.ts` — creators eligibility + albums default-arg guard
- `src/components/home/MusicHomePage.tsx` — creators wiring + count label (also restored UTF-8 after UTF-16 corruption)
- `src/App.css` — controlled title wrapping on `.music-home-artist-card strong`
- Audit/scripts under `docs/audits/creators-orbit/` and `scripts/*creators*`

## Cache handling
- No creators-specific cache to invalidate.
- After fix, counts recompute from live artist tracks/indexes on each Home render.
- Did not clear all user data / wholesale catalog cache.

## Screenshots
1. Before: `01-creators-before-section.png` (reconstructed from live API + old count rule)
2. Raw data: `raw-creators-audit.json` (≥3 invalid/empty + ≥3 miscounted)
3. After: `03-creators-after-section.png` (eligible creators with correct playable counts)
4. Empty: `05-empty-section.png` (section omitted when builder returns [])
5. Reduced width: `06-creators-reduced-width.png`
6. Live Electron Home often still shows empty catalog during concurrent dirty-tree work; builder unit + Express proof cover eligibility.

## Validation
- `test-creators-orbit-eligibility.mjs` — PASS
- `test-creators-orbit-builder.mjs` (esbuild bundle of real `buildCreatorsInOrbit`) — PASS
- ESLint on changed TS files — PASS
- `tsc` — no errors in `mobileHomeParity` / `MusicHomePage` (pre-existing App/search errors remain)
- Home mobile parity script — FAIL on **album play-in-place** assertions (concurrent album work; not creators)
- Protected playback systems not modified for this fix
