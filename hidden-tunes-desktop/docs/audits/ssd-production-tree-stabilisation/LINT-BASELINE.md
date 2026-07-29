# Lint Baseline (Stabilisation)

## Full ESLint

| State | Result |
|-------|--------|
| Before commit | 33 errors, 3 warnings (from launch-readiness audit) |
| After commit (HEAD `20a3d89`) | **33 errors, 3 warnings** (unchanged count) |

Example deferred class: `react-hooks/refs` — updating ref during render in player style hook.

## Targeted ESLint (new/critical modules)

Files: `musicGenres.ts`, `catalogDisplayText.ts`, `smartContinuation.ts`, `resolveActivePlayerSurface.ts`, `tvChannelTransport.ts`, `HiddenTunesGlobalBackground.tsx`

**Result: PASS (exit 0)**

## Classification of full-ESLint failures

| Category | Action this phase |
|----------|-------------------|
| Existing in HEAD / pre-existing style-hooks debt | **Deferred** — no broad rewrite |
| Introduced by dirty production-tree work (targeted new modules) | Clean — targeted PASS |
| Style-only | Deferred |
| Legitimate runtime defect | None identified as blocking stabilisation |

**Policy:** Full zero-error ESLint is a later launch phase, not required to stabilize the runnable tree.
