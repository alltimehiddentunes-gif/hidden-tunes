# Hidden Tunes — Mobile Source of Truth

## Active workspace

`D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142`

This is the **only** active Hidden Tunes mobile workspace.

Do not develop, start Metro, build, validate, commit, or release from any other Hidden Tunes mobile copy, including Desktop folders or `C:\HiddenTunes-Archive\*`.

## Active development branch

`fix/library-content-type-safe`

## Active development baseline (SSD HEAD)

Recorded 2026-07-31:

```text
7de84b2163522b6afacb06e7cc7eeb5774e0cb23
```

Short:

```text
7de84b2
```

This HEAD contains both:

- `bbf3f1b` — Emotional Worlds full-catalog mood-room repair
- `7de84b2` — iOS `removeClippedSubviews` Fabric watchdog repair

Future commits must descend from this HEAD unless explicitly instructed otherwise.

Resolve with:

```bash
git -C "D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142" rev-parse HEAD
```

## Archive

Historical / duplicate mobile copies live under:

`C:\HiddenTunes-Archive`

They are read-only recovery copies. Do not edit, Metro-serve, or build from them.

## Desktop app sibling

`D:\HiddenTunes\Active\HiddenTunes-Desktop` is the desktop app workspace only.

## Rules for future work

1. Open only the SSD mobile workspace in Cursor.
2. Start Metro only from the SSD path.
3. Run EAS / Expo builds only from the SSD path.
4. Do not resurrect Desktop `HiddenTunes*` folders as active mobile workspaces.
5. Do not switch branches, reset, rebase, clean, stash, or rewrite history unless explicitly instructed.
