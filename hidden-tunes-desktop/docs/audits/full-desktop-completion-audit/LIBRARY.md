# Library System Audit (Desktop)

> Desktop-only. Mobile Sports/CarPlay are out of scope.

## Surfaces

| Surface | Owner | Content-type safety | Gaps |
|---------|-------|---------------------|------|
| Library | `DesktopLibraryPage.tsx` + typed library v2 | Strong typed dispatch | Sports unsupported |
| Favorites (nav Liked) | `LikedPage` (music likes) | Music-only | **Label mismatch** vs multi-type Library hearts |
| Playlists | `DesktopPlaylistsPage.tsx` | Typed items supported | Song-add UI skew; play uses `manual` context |
| Downloads | `DesktopDownloadsPage.tsx` + Electron downloads | Typed families + path safety | Music tab stub contradicts |
| History | `DesktopHistoryPage.tsx` | Typed history contract PASS | Some families navigate instead of resume |

## Contract scripts (this audit)

- `verify-typed-library-contract.mjs` — PASS
- `verify-playlists-contract.mjs` — PASS
- `verify-downloads-contract.mjs` — PASS
- `verify-history-contract.mjs` — PASS

## Cross-family issues

1. Sidebar “Favorites” is not the typed Library favorites experience.
2. Library sports favorites unsupported by design today.
3. History sports → navigate to Sports only.
4. Downloads real path exists, but Music section still shows “not available on desktop yet.”

## Verdict

Typed local library stack is mostly solid. Product IA for Favorites/Downloads messaging is inconsistent and release-visible.
