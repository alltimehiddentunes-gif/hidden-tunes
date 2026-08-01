# Phase 7 — Performance

## Changes impact

- Hero uses existing `buildHomeHeroCards` memo — no new catalogue fetches.
- Removed Top Charts rail (fewer DOM nodes + fewer static images).
- Album play lock / loading state unchanged (prevents double starts).
- Expanded player backdrop uses existing artwork URL (CSS only; no extra network beyond artwork already loaded for the track).
- No new polling, autoplay previews, or video backgrounds.

## Watch items

- Very wide album grids remain CSS grid (bounded by `buildAlbumsWorthStayingWith` limit).
- All Songs list remains windowed via `HOME_CATALOG_PAGE_SIZE` / Load more.

No intentional memoisation churn beyond existing Home memos.