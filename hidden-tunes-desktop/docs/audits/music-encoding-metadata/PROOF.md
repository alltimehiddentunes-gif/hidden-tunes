# Music encoding / metadata audit

## Raw corrupted value

Source literals in `src/App.tsx` (before repair):

- `Jazz Caf├â┬®` (intended `Jazz Café`)
- `50 songs ├óÔé¼┬ó 3h 12m` (intended `50 songs • 3h 12m`)
- `├óÔé¼ÔÇØ` (intended `—`)
- `┬À` (intended `·`)

Exact UTF-8 bytes for one corrupted accent sequence (`├â┬®`):

`e2 94 9c c3 a2 e2 94 ac c2 ae`

## Layer comparison

| Layer | Sample | Encoding |
|---|---|---|
| Raw Express API (`/api/songs`) | `"title":"Liya & Simi Adua Remix"`, `"album":"Singles"` | Valid UTF-8 JSON |
| Raw Express API (`/api/albums`) | `"title":"Singles"`, `"artistId":"cd9091ad-…"` | Valid UTF-8; **camelCase `artistId`** |
| Electron `catalogBridge` | `response.text()` → `JSON.parse(text)` | No latin1/Buffer re-decode |
| Preload bridge | IPC JSON passthrough | No text transform |
| Desktop mapping (**before**) | `normalizeAlbum` read only `artist_id` | `artistId` always `null` → UI **"Unknown artist"** |
| Desktop mapping (**after**) | reads `artistId` \|\| `artist_id` | `"Its Country Time"` etc. |
| React render | Display helpers reject mojibake / blank / `"0 songs"` on empty non-collection counts | Safe labels only |

## First corruption point

1. **UI chrome / separators:** earliest point is **baked-in mojibake inside `App.tsx` source literals** (multi-layer UTF-8 mangling). Not CSS/fonts. Not the catalog bridge.
2. **Unknown artist on album cards:** earliest incorrect mapping step is `normalizeAlbum` in `src/lib/api.ts` ignoring camelCase `artistId`.
3. **Repeated Singles:** already present in the **backend/import** (`album` / `album_title` / album `title` are literally `"Singles"`). Client no longer invents extra `"Singles"` when album is missing/nested.

## Root cause

- Prior Windows/PowerShell-style encoding round-trips corrupted Unicode punctuation and accents **in source**.
- Album artist linkage dropped because mapping expected `artist_id` while Express returns `artistId`.
- Fallback labels (`Unknown artist`, `0 songs`, invented `Singles`) amplified missing/partial metadata in the UI.

## Files changed

- `hidden-tunes-desktop/src/lib/catalogDisplayText.ts` (new)
- `hidden-tunes-desktop/src/lib/api.ts`
- `hidden-tunes-desktop/src/App.tsx`
- `hidden-tunes-desktop/src/components/music/MusicDiscoverPage.tsx`
- `hidden-tunes-desktop/src/components/music/MusicSectionContent.tsx`
- `hidden-tunes-desktop/scripts/test-catalog-display-text.mjs` (new)

## Tests

```bash
node --experimental-strip-types hidden-tunes-desktop/scripts/test-catalog-display-text.mjs
```

Result: `catalog display text tests passed`

## Screenshots

- Before: `docs/audits/music-encoding-metadata/BEFORE-1440.png`
- After: capture with Music page open after reload (`npx electron scripts/capture-music-page-repair.mjs AFTER` while Vite is running), saved beside BEFORE.
