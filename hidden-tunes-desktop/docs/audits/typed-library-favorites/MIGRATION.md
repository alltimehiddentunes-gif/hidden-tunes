# Library Migration

## Old keys

| Key | Family |
| --- | ------ |
| `ht-desktop:music-likes` | Music likes |
| `ht-desktop:tv-favorites` | TV favorites |
| `ht-desktop:lectures-saved` | Lecture series saves |

## New key

`ht-desktop:library:v2` with one-shot flag `ht-desktop:library:v2:migrated`

## Rules

1. Run once (flag + `migratedAt`).
2. Preserve valid favorites.
3. Assign type from source store evidence only.
4. Reject malformed rows safely.
5. Never classify Radio as Song because it shared the audio player.
6. Never extract an 11-character YouTube ID from a Radio id.
7. Prefixed non-music ids found in music-likes → `legacy_unknown` (ambiguous), not Song.
8. Do not delete old keys after conversion.
9. Idempotent: second run with flag set does not re-merge.

## Contract harness sample counts

From `node scripts/verify-typed-library-contract.mjs` fixture:

```text
read: 8
migrated: (songs + tv + lectures)
deduplicated: >= 1
rejected: >= 2
ambiguous: >= 1 (radio-prefixed music like)
```

Exact runtime user counts vary by device; migration report is stored on the v2 document when first conversion runs.
