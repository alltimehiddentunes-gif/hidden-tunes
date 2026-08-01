# Phase 3 FINAL REPORT — Home Recently Added truthfulness

## Workspace proof

| Field | Value |
|-------|-------|
| Drive | D: |
| Label | `llordwills` |
| Filesystem | NTFS |
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` (unchanged — no commit) |
| Dirty state | Preserved (Phases 1–2 + this repair + prior helpers/audits) |

## Baseline

| Gate | Result |
|------|--------|
| `npx tsc -b --pretty false` | **0** |
| `npm run build` | **PASS** |
| `npm run dist` | **PASS** |
| `verify:playback-mutex` | **PASS** |
| `verify:route-media` | **PASS** |
| `verify:video-surface` | **PASS** |

## Root cause

`MusicHomePage.tsx` built a real song list via `buildRecentlyAddedSongs(songs)` (sorted by `createdAt` latest), then **visually overlaid** a hardcoded `HOME_RELEASES` array (`Sunset Dreams` / `Jaden Moore` / `/home-reference/release-*.webp`) onto those songs by index:

```tsx
HOME_RELEASES.map((release, index) => {
  const song = recentlyAdded[index % recentlyAdded.length]!
  // click played `song`, but UI showed release.title / release.artist / release.artwork
})
```

Playback/Queue received the real `ApiSong`; the card lied. Charts/Moods use decorative search gateways (not the same overlay mapper) and were left for a later honesty pass.

## Real data source

| Concern | Detail |
|---------|--------|
| Source | In-memory production music catalogue `songs` from existing Home/`useCatalog` path |
| Builder | `buildRecentlyAddedSongs` in `src/lib/home/mobileHomeParity.ts` |
| Ordering | `sortSongsList(songs, 'latest')` → `Date.parse(createdAt)` descending (`src/lib/api.ts`) |
| Label | **Recently Added** — truthful for catalogue insertion/`createdAt` order |

## Files inspected

- `src/components/home/MusicHomePage.tsx`
- `src/lib/home/mobileHomeParity.ts` (`buildRecentlyAddedSongs`, `HOME_UI`)
- `src/lib/api.ts` (`sortSongsList`)
- Other Home rails for the same overlay pattern (Charts/Moods = search gateways only)

## Files changed

| File | Repair | Preserved |
|------|--------|-----------|
| `src/components/home/MusicHomePage.tsx` | Removed `HOME_RELEASES`; map `recentlyAdded` with `song.title` / `song.artist` / `song.artwork` / `song.id`; honest Untitled / Unknown artist fallbacks; NEW badge only on newest (index 0) | Layout, playFromQueue, Home shell, other rails |
| `src/App.css` | Minimal `.music-home-release-card > .music-home-art` fill rules so `HomeArt` replaces direct `<img>` without redesign | Chart/mood img rules unchanged |
| `package.json` | `verify:recently-added` script | Build scripts unchanged |
| `scripts/verify-recently-added-truthfulness.mjs` | New source-contract verifier | — |
| Capture helper under `scripts/capture-recently-added-evidence.mjs` | Evidence only | — |

## Truthfulness proof (runtime)

From `screenshots/recently-added-probe.json` + `after-play-probe.json`:

| Visible card | Aria | Played / footer |
|--------------|------|-----------------|
| Ikkimel IDGAF · Hidden Tunes | Play Ikkimel IDGAF by Hidden Tunes | footerTitle `Ikkimel IDGAF`, footerArtist `Hidden Tunes`, surface `audio` |
| Additional cards | real catalogue titles | `isFakeTitle: false` for all sampled cards |
| Fake residue | — | `hasFakeArrayResidue: false` (no Sunset Dreams) |

Artwork `imgSrc` values are distinct R2 catalogue cover URLs (not `/home-reference/release-*.webp`).

**Note:** Many catalogue rows use artist string `Hidden Tunes` in production data. That is the stored field, not UI invention. Titles are real catalogue titles.

## Loading, empty, fallback

- Loading: section `loading={showCatalogSkeleton && recentlyAdded.length === 0}` — no fake clickable cards
- Empty: `HOME_UI.recentlyAddedEmpty`
- Missing title/artist: `Untitled` / `Unknown artist`
- Missing artwork: existing `ArtworkImage` / `HomeArt` neutral fallback (no cross-song art)

## Runtime screenshots

| Path | Description |
|------|-------------|
| `screenshots/02-home-recently-added.png` | Home with Recently Added showing real titles |
| `screenshots/03-after-play.png` / `04-player-identity.png` | After clicking first card; player matches card |
| `screenshots/recently-added-probe.json` | DOM probe (8 cards, no fake titles) |
| `screenshots/after-play-probe.json` | Card→footer identity match |

## Verification gates

| Command | Result |
|---------|--------|
| `npm run verify:recently-added` | **PASS** |
| `npm run verify:playback-mutex` | **PASS** |
| `npm run verify:route-media` | **PASS** |
| `npm run verify:video-surface` | **PASS** |
| `npx tsc -b --pretty false` | **0** |
| `npm run build` | **PASS** |
| `npm run lint` | **28 errors / 3 warnings** (pre-existing); **MusicHomePage eslint clean** |
| `npm run dist` | **PASS** |

## Dirty-work preservation

No reset/clean/stash/commit/push. Phases 1–2 and unrelated helpers preserved. Backend untouched.

## Remaining launch blockers (untouched)

1. Electron CSP + navigation guards  
2. Premium honesty gaps  
3. ESLint debt  
4. Music redesign  
5. Version `0.0.1` + signing  
6. Sports DASH fidelity QA  
7. Charts/Moods decorative search-gateway honesty (separate from this overlay bug)

## Phase verdict

**Phase 3 PASS — Home Recently Added now displays only truthful production catalogue metadata, and every visible card matches the exact item sent to playback, Queue and the active player.**
