# Build & verification results (HEAD `3b4a91f`)

## TypeScript

| Command | Exit | Notes |
|---------|------|-------|
| `npx tsc --noEmit` (root) | **0** | **False green.** Root `tsconfig.json` has `"files": []` and only project references — this command typechecks almost nothing. |
| `npx tsc -b` | **2** | **72 errors** across 6 files. This is what `npm run build` runs. |
| `npm run build` (`tsc -b && vite build`) | **2** | Stopped at `tsc -b`; production build script **fails**. |
| `npx vite build` alone | **PASS** | Produces `dist/` (~1.38 MB JS chunk). Bundle size warning (>500 kB). |

### Files failing `tsc -b`

- `src/App.tsx` (unused symbols + NavKey callback typing)
- `src/components/search/GlobalSearchSections.tsx` (many `unknown` property accesses)
- `src/lib/desktopCatalogBridge.ts` (Window bridge declaration clash)
- `src/lib/downloads/bridge.ts` (same Window clash / empty bridge typing)
- `src/lib/downloads/dispatchDownloadPlayback.ts` (`string | null` → `string`)
- `src/lib/playlists/dispatchPlaylistPlayback.ts` (same)

Artifacts: `tsc-b-output.txt`, `build-output.txt`, `vite-build-only.txt`

## ESLint

| Command | Exit | Result |
|---------|------|--------|
| `npx eslint .` | **1** | **36 problems (33 errors, 3 warnings)** |

Dominant classes: `react-hooks/set-state-in-effect`, unused vars, `react-hooks/refs`, `no-useless-assignment`.

Artifact: `eslint-output.txt`

## Scripts

| Script | Result |
|--------|--------|
| `scripts/verify-home-genres.mjs` | **14 static PASS**; live Afrobeats page 1 → **HTTP 503** (API unavailable at audit time) |
| `scripts/verify-playback-mutex.mjs` | **PASS** (TV/Sports/lecture-video/motivational-video routing assertions) |

## Electron runtime smoke

| Check | Result |
|-------|--------|
| `npm run dev` | Vite ready on **http://localhost:5173/**; Electron launched (local Electron 42.2.0) |
| Runtime signal | Client logged `[ht-video-playback] play() failed` for an unavailable TV stream — proves renderer + video path active |
| Packaging / installer | **Not run** (unsigned `0.0.1`; `npm run build` blocked) |

## Classification of failures

| Failure | New vs known | Severity for launch |
|---------|--------------|---------------------|
| `tsc -b` 72 errors blocking `npm run build` | **Critical finding this audit** (masked by noop `tsc --noEmit`) | **CRITICAL** |
| ESLint 33 errors | Existing baseline class | HIGH (quality gate) |
| Genre live API 503 | Environmental at audit time | MEDIUM (cannot certify live genre inventory today) |
| Vite chunk >500 kB | Existing | LOW |
