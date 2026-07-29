# Generated Noise Decisions

| Path pattern | Decision | Reason |
|--------------|----------|--------|
| `scripts/_*` (17 files) | Unstage; leave on disk; do not commit | One-shot patch/probe/repair helpers; not imported by runtime |
| `docs/audits/player-sidebar/_bak*` | Unstage; leave on disk | Duplicate source snapshots; not needed in Git |
| Vite/Electron caches | Not present in dirty list | N/A |
| `node_modules` / `dist` / `release` | Not staged | Correct |

No files were deleted. No broad `.gitignore` changes in this phase unless later justified.
