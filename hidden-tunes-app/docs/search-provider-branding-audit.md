# Search Provider Fallback + Branding Audit

**Scope:** Mobile search only. No playback, queue, UI redesign, Desktop, CarPlay, or Android Auto.

**Goal:** Unified Hidden Tunes-branded search with reliable fallback and no third-party provider labels in the UI.

---

## Providers wired (internal)

| Order | Provider | Service | User-facing label |
|-------|----------|---------|-------------------|
| 1 | Hidden Tunes backend + local catalog | `searchWaterfall.ts` → `hiddenTunesApi` | Hidden Tunes |
| 2 | Audius (fallback when playable < 2) | `fetchAudiusSearchTracks` | Hidden Tunes (branded) |
| 3 | Internet Archive (fallback when still < 2) | `archiveSearch.ts` | Hidden Tunes (branded) |
| — | TV / YouTube | Separate `TV` filter → `/tv` | Hidden Tunes TV in grouped results |

Internal `source` field retains `hidden-tunes` | `audius` | `archive` for debugging. `sourceName` is always user-branded as Hidden Tunes for catalog rows.

Jamendo (`jamendoSearch.ts`) is unwired dead code.

---

## Issues found

| Issue | Impact |
|-------|--------|
| MORE / VAULT filter chips mapped to Audius / Archive | Provider identity exposed |
| Row subtitles and badges showed source suffix | Visual clutter, third-party hint |
| “nearby libraries” loading copy | Implied external catalogs |
| Waterfall skip when local instant ≥ 4 songs | Audius/Archive never called for “good enough” local hits |
| `WATERFALL_MIN_SONGS = 4` | Fallback rarely triggered |
| Archive search capped at 5 rows, MP3-only | Thin fallback results |
| ID-only dedupe | Same song from multiple providers duplicated |
| No cross-provider dedupe in waterfall | Duplicate rows after fallback |

No `free/legal source` strings exist in search UI (privacy policy mentions third parties separately).

---

## Fixes applied

1. **`searchWaterfall.ts`** — Cross-provider dedupe (`dedupeWaterfallTracks`) preferring Hidden Tunes > Audius > Archive; threshold lowered to 2 playable tracks.
2. **`archiveSearch.ts`** — 12 result rows; OGG/Vorbis in addition to MP3.
3. **`search.tsx`** — Removed MORE/VAULT chips (CATALOG / ALL / TV only); removed source badges; artist-only subtitles; branded empty/loading copy via `TESTER_COPY`; removed waterfall skip so network fallback always runs; title+artist dedupe in `dedupeByKey`.

---

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: common/rare songs, artists, genres; no provider names; tap-to-play; background playback; auto-next.
