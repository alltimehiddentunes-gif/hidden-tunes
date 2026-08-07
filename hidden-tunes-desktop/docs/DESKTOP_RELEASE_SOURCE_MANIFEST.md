# Desktop 1.0.0 release source manifest

Every staged path belongs to one of the groups below. Whole-file staging is safe because this exact overlay was built and validated in an isolated checkout; `src/App.tsx` was also checked for Sports diff hunks and none were present.

| Classification | Paths | Reason / use |
|---|---|---|
| Release required | `package.json`, `package-lock.json`, `index.html`, `build/icon.ico`, `build/icon.png`, `electron/main.js`, `electron/preload.js`, `electron/tray-icon.png` | Version, packaging, Electron runtime, metadata, and branding used by the tested build. |
| Release required | All staged non-Sports files under `src/` | Renderer/runtime source used by the tested build. Includes the existing 424-key/20-locale infrastructure; it does not claim completion of the deferred 757 strings. |
| Release required | `public/brand/**`, `public/artwork/worlds/**` | Runtime assets resolved by the tested renderer. Emotional Worlds backend deployment remains deferred. |
| Release-test required | `scripts/build-windows-release.mjs`, `scripts/runtime-validation-harness.mjs`, and staged `scripts/verify-*.mjs` files | Reproducible Windows packaging and release contract evidence. |
| Release-doc required | `docs/DESKTOP_RELEASE_BASELINE.md`, `docs/DESKTOP_FEATURE_PARITY_SOURCE.md`, `docs/DESKTOP_PLAYBACK_CONTRACTS.md`, `docs/DESKTOP_PROTECTED_CORE.md`, `docs/DESKTOP_DEFERRED_FEATURES.md`, this manifest | Honest baseline, proof, protected boundaries, and deferrals. |
| Deferred / excluded | `src/components/sports/**`, Sports scripts, backend and Emotional Worlds deployment changes | User-excluded from this release gate. |
| Unrelated / generated / excluded | Audit screenshots/results, backend datasets, mobile work, logs, installers, unpacked output, and all other dirty paths | Not required to reproduce the validated Desktop source. |
| Unknown | Any dirty path not explicitly listed by the staged diff | Never stage by default. |

The authoritative per-file list is `git diff --cached --name-status` for the release commit. No `git add .`, reset, clean, stash, or unrelated-work deletion is permitted.
