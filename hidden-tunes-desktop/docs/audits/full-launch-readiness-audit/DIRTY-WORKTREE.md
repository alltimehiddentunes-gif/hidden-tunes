# Dirty Worktree Inventory

**Count:** ~264 porcelain entries (audit date 2026-07-29).  
**Do not alter.** Classification summary (heuristic; see `dirty-inventory.json`):

| Class | Approx count |
|-------|-------------:|
| Documentation / prior audits | 161 |
| Tests/verification scripts | 23 |
| Temporary helpers (`scripts/_*`) | 17 |
| Production source / Music / Home / playback / catalog | ~30+ (many staged) |
| Generated public home-reference assets | ~30 staged under `public/home-reference/` |
| Electron (`runtimeConfig.js`) | 1 modified |
| package.json | 1 modified |

## Required untracked/staged production modules (runtime)

| Path | Role | Lost on clean checkout? |
|------|------|-------------------------|
| `src/lib/musicGenres.ts` | Genre registry + intents | **Yes — genres break** |
| `src/lib/catalogDisplayText.ts` | Display normalisation | Yes |
| `src/lib/desktopPlayback/smartContinuation.ts` | Auto-next/smart queue | Yes |
| `src/lib/player/resolveActivePlayerSurface.ts` | Right-rail surface | Yes |
| `src/lib/tv/tvChannelTransport.ts` | TV transport helpers | Yes |
| `src/components/HiddenTunesGlobalBackground.tsx` | Global backdrop | Yes |
| `public/home-reference/*` | Home reference artwork | Yes — Home visuals degrade |

## Heavily modified production

`App.tsx`, `App.css`, `DesktopPlaybackProvider.tsx`, Home/Music/TV/player components, `api.ts`, musicCatalog, runtime configs (renderer + main), `package.json`.

## Launch impact

| Question | Answer |
|----------|--------|
| Features depend on uncommitted files? | **Yes** |
| Untracked/staged src required at runtime? | **Yes** |
| Reproducible from HEAD alone? | **No** |
| Dirty worktree is a launch blocker? | **Yes (Critical)** |
| Generated assets tracked? | Staged locally; not on HEAD |

**Verdict:** Dirty-worktree-only runtime is a **Critical** launch blocker until intentionally committed (or reverted with feature loss accepted).
