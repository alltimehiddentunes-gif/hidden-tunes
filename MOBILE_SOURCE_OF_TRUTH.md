# Hidden Tunes — Mobile Source of Truth

## Active workspace

`C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`

Do not develop mobile production work from any other Desktop copy, WSL path, backup, or temporary worktree.

## Permanent branch

`mobile-golden-baseline`

All future mobile work must start from this branch (branch from it, or rebase onto it). Do not treat older recovery / experiment branches as production sources.

## Protected tags

- `mobile-golden-pre-carplay-2026-07-19` — verified pre-CarPlay golden baseline (device-validated 2026-07-19)
- `mobile-current-production-source` — current production source pointer (same commit as the tag above at finalize time)

Resolve the exact commit with:

```bash
git rev-parse mobile-golden-baseline
git rev-parse mobile-golden-pre-carplay-2026-07-19^{commit}
git rev-parse mobile-current-production-source^{commit}
```

## Current commit hash

Recorded at finalize time in the repository tip / tags above. Canonical resolution:

```bash
git rev-parse mobile-golden-pre-carplay-2026-07-19^{commit}
```

(A Git commit cannot embed its own SHA in the same tree; always trust the tags and branch tip.)

## Baseline contents (verified)

- Pre-CarPlay CLEAN mobile state derived from `2a47c65`, plus the device-verified Library / More routing split:
  - Home **More** → `/more`
  - Bottom-nav **Library** → `/library` (collection only)
- TV PiP/background, queue, podcast organization, back navigation, Sports navigation, and related pre-CarPlay fixes retained
- Concerts unfinished WIP (`a47bb90`) **rejected** (does not build; not in this baseline)
- CarPlay **not** included

## Rules for future work

1. **Start from `mobile-golden-baseline`.** Create a new feature branch for every change set.
2. **CarPlay** must be developed only on a separate feature branch (never merged into this baseline until explicitly approved).
3. **Concerts** and any other large unfinished experiments must stay on separate feature branches.
4. Do not delete historical local/remote recovery branches unless a separate, approved cleanup is requested.
5. Do not treat other workspaces (`HiddenTunes`, `HiddenTunes-main`, WSL copies, backups) as production sources.

## Finalize note

Device validation for Library / More routing and core domains passed on 2026-07-19. This document marks the approved mobile production source of truth.
