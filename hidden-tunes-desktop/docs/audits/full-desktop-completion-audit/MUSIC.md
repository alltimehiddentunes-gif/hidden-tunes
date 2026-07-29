# MUSIC Audit (Desktop) — Highest visual priority

**Owners:** `MusicWorkspace.tsx`, `MusicDiscoverPage.tsx`, `MusicSectionContent.tsx`, `MusicSubNav.tsx`  
**Status:** Partially complete · **55%**  
**Classification:** **requires product redesign**  
**Release ready:** **No**

> Do not treat smoke/layout selector passes as visual completion.

## Structural findings

| Check | Result |
|-------|--------|
| Second vertical sidebar | **No live second sidebar** — horizontal tab bar only |
| Leftover sidebar CSS | Yes (`--music-subnav-width`, full-width sub-nav item rules) |
| Centre content width | Capped ~**1120px** — feels narrow |
| Competing columns | Shell sidebar + capped music column + right player = cramped |
| Tabs | Discover · Songs · Albums · Artists · Genres · Playlists |
| Downloads tab | Stub: “Offline downloads are not available on desktop yet” (contradicts real Downloads page) |
| Play stays on Music | Yes (`context: 'discover'`) |
| Artwork | Present on songs/albums/artists; charts/moods often text/color only |

## Functional vs visual

- **Functional:** Catalog browse, search, pagination, play paths work.
- **Visual:** Utilitarian / transitional; purple-tint tabs; leftover CSS debt; not Home-parity; not mobile Music premium parity.

## Explicit classification

**requires product redesign**

Not “almost done polish.” Needs a deliberate Music product layout pass (width, hierarchy, chrome, artwork density, IA), not another smoke-green incremental tweak.

## Defects (High)

1. Visually unacceptable vs release bar / Home
2. Downloads stub contradiction
3. Width + right-player dominance at common desktop sizes
4. Dirty uncommitted Music/display WIP means HEAD ≠ live Music
