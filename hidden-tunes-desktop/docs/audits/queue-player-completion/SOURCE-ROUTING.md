# Source Routing

Playback URLs are resolved at play time inside `DesktopPlaybackProvider.playSong` — the typed queue never embeds permanent remote stream URLs.

| Family | Detector | Resolver |
| ------ | -------- | -------- |
| Radio | `isRadioQueueSong` (`radio-` prefix) | `resolveRadioPlayUrl` |
| Podcast | `isPodcastQueueSong` | `resolvePodcastPlayUrl` |
| Audiobook | `isAudiobookQueueSong` | `resolveAudiobookChapterPlay` |
| Motivational | `isMotivationalQueueSong` | `resolveMotivationalPlay` |
| Lecture | `isLectureQueueSong` | lecture play path |
| TV | `isTvQueueSong` | `resolveTvPlayUrl` (video) |
| Sports | `isSportsQueueSong` | sports video path |
| Music | catalog / offline | quality mode + audio versions |

## Offline / Downloads

Downloads keep the **original family** discriminator. Local markers:

- `localDownloadId`
- `metadata.localSource`
- `offline` / `download` tags and `ht-download://` only for local resolution at play time

Legacy WIP rows typed `offline_audio` migrate on load via `LEGACY_OFFLINE_QUEUE_ITEM_TYPE`.

Remote fail paths stay on family resolvers — no invented streams.

## History

Successful play may mirror family history (radio / sports helpers, podcast/music/audiobook progress). Failures do not invent history entries.
