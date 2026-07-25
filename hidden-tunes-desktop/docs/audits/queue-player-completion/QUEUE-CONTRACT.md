# Queue Contract

Source: `src/lib/queue/*`, bridged by `apiBridge.ts` into `DesktopPlaybackProvider`.

## Storage

| Key | Cap | Restore |
| --- | --- | ------- |
| `ht-desktop:queue:v1` | `QUEUE_MAX_ITEMS = 500` | Paused — **never autoplay** |

Schema (`QueueStoreV1`): `version: 1`, `updatedAt`, `items[]`, `activeIndex` (`-1` if none). No `wasPlaying` autoplay flag is honored.

Persistence strips secrets and remote stream URLs (`sanitizeQueueMetadata`). TV / Sports songs return `null` from `inferQueueItemType` / `isPersistableQueueSong` and are **not** written into the typed audio queue.

## Item types

`song` · `radio` · `podcast_episode` · `audiobook_chapter` · `motivational` · `lecture`

Identity is typed: `type:id` (`queueItemIdentity`). Same raw id across families does not collide.

Downloads keep the original family and set `localDownloadId` / local markers. Legacy `offline_audio` rows migrate on load.

TV / Sports are session video owners (shared video element) and are **not** persisted into the typed audio queue; capabilities still cover them via `resolvePlaybackCapabilities`.

## Duplicate policy

| Op | Policy |
| -- | ------ |
| `playNow` | If typed identity exists → **activate existing** (no second copy). Else insert + activate. |
| `enqueue` / `enqueueSong` | Skip when same identity / `song.id` already present unless `allowDuplicate`. |
| `playNext` / `insertPlayNext` | Insert after active; ApiSong bridge also skips duplicate ids unless allowed. |

## Remove / reorder / clear

- `remove` / `removeAtIndex`: removing the **active** item promotes the following index (caller plays). If none remain after active, `activeIndex = -1`.
- `move` / `moveIndex`: preserves active tracking across reorder.
- `clear` / `clearPersistedQueue`: empties store / upcoming helpers clear remaining after active.

## Caps

Enqueue beyond 500 is rejected (item not added). Normalize on load also slices to 500.
