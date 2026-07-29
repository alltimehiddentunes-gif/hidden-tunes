# RADIO Audit (Desktop)

**Owner:** `src/components/radio/RadioPage.tsx`  
**Status:** Mostly complete · **82%** · functionally complete but visually incomplete  
**Release ready:** Conditional

## Verified

| Area | Result |
|------|--------|
| Browse / search / filters | Tabs + genre/country; debounce ~280ms + abort/stale guards |
| Station cards / logos | Present |
| LIVE badges | Decorative card badge + capability-driven player LIVE |
| Play resolver | `/play` resolve; code accepts `http` URLs (comment says HTTPS/relay) |
| Seek / duration | `durationSeconds: null`; non-seekable live progress |
| Queue / prev-next | Station switching via provider; no fake finite seek |
| Favourites / history | Via library/history typed paths |
| Visual | SectionHero + emoji genre icons — usable, not premium-finished |

## Defects

- Decorative LIVE overclaim risk
- http vs HTTPS comment drift
- Visual polish below Home bar
