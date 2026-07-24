# Auto-Advance

## Finite end (`audio` / `video` `ended`)

1. Persist family progress as completed when applicable.
2. Repeat-one → replay current index.
3. Otherwise walk forward from `currentIndex + 1`.
4. Extend related queue when at the last seed item (music intelligence / lecture continuation).
5. Repeat-all → wrap from index `0` with the same mature walk.
6. Else stop: `setIsPlaying(false)`, position reset.

## `next()` transport

Advances from `currentIndex + 1` (or wrap on repeat-all). Same mature walk. Does not loop forever when the queue ends without repeat-all.

## Mature skip

When `isMatureLibraryAccessEnabled()` is false (`ht-desktop:mature-library-access !== '1'`), advancing skips items where:

- any `tags` match `/mature|adult|explicit/i`, or
- `genre` matches `/adult|mature|explicit/i`, or
- radio title matches `/sex sound/i`

Walk is **bounded** (`MATURE_SKIP_WALK_LIMIT = 64`) to prevent infinite loops.

If every remaining candidate is blocked (or walk exhausts), playback **stops cleanly** and sets:

> `This item is restricted by your content settings.`

Also applied when radio media-error auto-tries the next station.
