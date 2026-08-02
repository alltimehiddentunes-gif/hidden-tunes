# Podcast Lock-Screen Metadata Audit

## Workspace proof

- Workspace: `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142`
- Branch: `fix/library-content-type-safe`
- Starting HEAD: `95b89f53626b383f21c81b2e89ecf003ac0ac2ec`
- Starting status: clean; no pre-existing dirty files
- Metro port requested for device verification: `8081`

## Reproduced failure and root cause

The real-iPhone lock-screen sequence could not be performed autonomously because it requires a connected physical iPhone and human observation. No device result is invented here.

The metadata loss was reproduced statically in the backend Podcast show path: `catalogEpisodeToDisplayEpisode` and `catalogEpisodeToPlayableEpisode` used only `metadata.artworkUrl`. When an episode had no episode image, the already-loaded `show.artworkUrl` was discarded. The empty value was copied into same-show queue rows and survived screen unmount and resolve-on-demand Next. Podcast identity and durable episode/show fields were also inferred from the `podcast-` ID and queue context instead of retained explicitly on each item.

Podcast metadata already used the shared PlayerContext/HiddenAudio path for title, artist, album, duration, position, state, queue controls, transitions, and cleanup. No second Now Playing publisher was needed.

## Music versus Podcast metadata

| Field | Music path | Podcast path after repair |
| --- | --- | --- |
| title | `AppSong.title` | episode title in `title` and `episodeTitle` |
| artist/subtitle | `AppSong.artist` | show title in `artist` and `showTitle` |
| album | `AppSong.album` | show title |
| artwork | song artwork → global fallback | episode artwork → show artwork → existing global logo |
| duration | `AppSong.duration` | episode duration |
| media ID | song ID | `podcast-{episodeId}` plus `episodeId` |
| content type | Music/shared audio | explicit `contentType: podcast` plus Podcast context |
| update timing | shared `loadAndPlay` | same shared `loadAndPlay` |
| transitions | shared queue functions | same shared queue functions |

## Queue metadata findings

Every constructed Podcast `AppSong` now retains `id`, `contentType`, `episodeId`, `podcastId`, `showId`, `episodeTitle`, `showTitle`, audio URL aliases, artwork aliases, duration, `publishedAt`, category, mature/general scope, and provider. PlayerContext normalization spreads these fields, so they remain after the Podcast screen unmounts.

## Ownership table

| Responsibility | File | Function |
| --- | --- | --- |
| Podcast episode normalization | `utils/podcastPlaybackAdapter.ts` | `podcastEpisodeToAppSong` |
| Queue item creation | `utils/podcastPlayback.ts` | `startPlaybackWithEpisodes` / `playPodcastEpisodeFromShow` |
| Playback start | `context/PlayerContext.tsx` | `playSong` → `playQueue` → `loadAndPlay` |
| Now Playing update | `context/PlayerContext.tsx` / `services/playbackBridge.ts` | `loadAndPlay` / `activateHiddenAudioPlayback` |
| Artwork mapping | `app/podcasts/show/[id].tsx` / `utils/artwork.ts` | catalog conversion / `getArtworkValue` |
| Auto-next refresh | `context/PlayerContext.tsx` | `playQueueAtIndex` → `loadAndPlay` |
| Manual next refresh | `context/PlayerContext.tsx` | `nextSong` → `playQueueAtIndex` |
| Manual previous refresh | `context/PlayerContext.tsx` | `previousSong` → transition or restart-current seek |
| Stop/clear metadata | PlayerContext / HiddenAudio | existing `stopPlayback` / native clear path |

## Files inspected

Podcast screens, types, services, playback adapter/binding/router, `PlayerContext`, `playbackBridge`, HiddenAudio JS bridge, iOS HiddenAudio Now Playing implementation, artwork utilities, playback handoff coordinator, and relevant test scripts.

## Files changed

- `app/podcasts/show/[id].tsx`
- `context/PlayerContext.tsx` (type fields only)
- `utils/podcastPlaybackAdapter.ts`
- `scripts/test-podcast-lockscreen-metadata.ts`
- this report

## Mapping and transition results

- Title remains the episode title.
- Artist/subtitle and album remain the show title.
- Artwork uses episode, then show, then the existing Hidden Tunes logo.
- Duration remains on `AppSong.duration`; native progress owns elapsed time and bounded one-second updates. No cadence changed.
- Manual Next, Previous, lock-screen commands, and auto-next continue through the existing PlayerContext transition and `loadAndPlay` path.
- Existing playback handoff and HiddenAudio stop/clear behavior remain unchanged for Podcast ↔ Music/Radio/TV switches.

## Performance impact

The repair adds scalar fields during Podcast queue construction and a constant-time two-value artwork choice. It adds no polling, fetch, listener, progress write, artwork loop, feed fetch, or render loop. Queue limits and hydration are unchanged.

## Tests

Passed:

- `npm run typecheck`
- targeted ESLint for the changed Podcast files and focused test
- Podcast lock-screen metadata contract
- Podcast same-show autoplay, continuation, episode pipeline, queue-bound, and performance tests
- playback handoff and tap-ordering tests
- TV Now Playing media-session contract

Known baseline failures:

- `test-ios-static-ownership.mjs` expects the exact source string `player?.play()` while current native code uses a different receiver. This task did not change native code.
- Full-file PlayerContext lint contains pre-existing errors; targeted changed-Podcast-file lint passes.

## Device verification

Pending on a real iPhone through Metro `8081`: initial title/show/artwork/duration/position, pause/resume, Next/Previous, natural auto-next, show switch, Podcast ↔ Music/Radio/TV, background/foreground, and ten-minute background stability. These are not claimed as passed.

## OTA and build classification

The repair is JavaScript/TypeScript only and OTA-safe after device verification. No native API or dependency changed. Metro reload is sufficient; no new build is required.

## Remaining limitations

- Real-device results remain pending.
- Failed remote artwork uses the existing global fallback; no Podcast-specific bitmap was added.
- The unrelated baseline static-ownership assertion should separately be changed to test behavior instead of exact receiver spelling.

## Safety confirmation

No reset, clean, stash, rebase, branch switch, commit, push, deploy, migration, OTA publish, native dependency change, or build occurred. No playback owner, queue behavior, auto-next behavior, background behavior, Music/Radio/TV metadata path, CarPlay, Android Auto, MiniPlayer, or global media-session ownership was changed.
