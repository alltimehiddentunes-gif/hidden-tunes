# GENRES Audit

**Registry:** `src/lib/musicGenres.ts` (staged — required)  
**Verifier:** `scripts/verify-home-genres.mjs` — **PASS** this audit (static + 12 production destinations)

| Genre | Slug | requestValue | Playable (verifier) | Status |
|-------|------|--------------|--------------------:|--------|
| Afrobeats | afrobeats | afrobeat | 585 | Working |
| Hip-Hop | hip-hop | hip-hop | 169 | Working |
| R&B | r-and-b | soul | 30 (exact filter) | Working |
| Pop | pop | pop | 133 | Working |
| Dance | dance | edm | 41 | Working |
| Jazz | jazz | jazz | 56 | Working |
| Gospel | gospel | gospel | 64 | Working |
| Country | country | country | 30 | Working |
| Rock | rock | rock | 0 | Honest empty |
| Classical | classical | classical | 0 | Honest empty |
| Latin | latin | latin | 0 | Honest empty |
| Reggae | reggae | reggae | 0 | Honest empty |

## Confirmed

- Home tiles use `createMusicGenreIntent`, not generic `q=` search
- API uses `genre=` parameter
- Pagination + exact `backendValues` filter + scan cap
- Destination is DiscoverPage genre mode (not a separate URL route)

## Risks

- Dirty-only registry
- Search-box lag was observed earlier; draft debounce fix lives in dirty App.tsx
- Genre destination lives inside Search nav IA (not dedicated Music genre route)
