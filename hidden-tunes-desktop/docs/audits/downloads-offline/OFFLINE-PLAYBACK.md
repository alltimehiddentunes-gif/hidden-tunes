# Offline Playback

## Routing

Completed downloads play through the existing desktop playback stack:

| Download type | Queue identity | Owner |
| ------------- | -------------- | ----- |
| `song` | music song id | Music audio |
| `podcast_episode` | `podcastEpisodeSongId` | Podcast audio |
| `audiobook_chapter` | `audiobookChapterSongId` | Audiobook audio |
| `motivational` | `motivation-{program}--{session}` | Motivational |
| `lecture` | `lecture-{series}--{session}` | Lecture |

Local source URL: `ht-download://media/<relative/path>`

`isPlayableMediaUrl` / `asHttpUrl` accept `ht-download://` so resolvers are skipped when a local URL is already present. Playback mutex is unchanged.

## Progress

Family-specific progress stores continue to apply (podcast / audiobook / motivational / lecture / music). Offline and streamed copies of the same typed identity share the same progress namespace.

## Connectivity

`useDesktopConnectivity` listens to `online` / `offline` events (no polling). Advisory only. Completed downloads remain playable offline; Radio/TV still require network.
