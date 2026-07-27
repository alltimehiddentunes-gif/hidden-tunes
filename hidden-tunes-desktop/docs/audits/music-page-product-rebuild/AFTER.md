# Music Page Product Rebuild — AFTER

**Start HEAD:** `a59b4cbbb7febcd1f0a9aed8b4459f98ab1f5177`

## BEFORE → AFTER (visual)

| Issue | Before | After |
|-------|--------|-------|
| Dominating UI | Tall Browse side-nav + weak Featured | Horizontal tabs (Discover/Songs/Albums/Artists/Genres/Playlists) |
| Songs | Buried in side menu; **0** above fold | Dense song rows first; above fold at 1024–1720 |
| Albums / Artists | Not on Discover | Dedicated rails (+ tabs) |
| Header | Verbose “Browse the catalog” anti-history copy | Compact `Music` + short subtitle |
| Featured | Weak DEV featured panel | Removed |
| Card scale | Oversized release squares | Dense rails ≤152px |
| Tabs at 1024 | Side-nav ate half the page | Horizontal pills; Songs + New Releases above fold |

## Final Discover order
1. Compact Music header  
2. Continue Listening (only if real recent)  
3. Songs (strongest)  
4. New Releases  
5. Albums  
6. Artists  
7. Genres  
8. Moods  
9. Popular charts (if real)

## Metrics (Electron)

| Width | Above fold | maxArt |
|-------|------------|--------|
| 1024 | Music · Songs · New Releases | 152 |
| 1280 | Music · Songs · New Releases | 152 |
| 1440 | Music · Songs · New Releases | 152 |
| 1720 | Music · Songs · New Releases · Albums | 152 |

Screenshots: `AFTER-1024.png` · `AFTER-1280.png` · `AFTER-1440.png` · `AFTER-LARGE.png`
