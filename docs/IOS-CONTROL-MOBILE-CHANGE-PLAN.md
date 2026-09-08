# iOS operational policy: local phase 1

Baseline: branch `feat/ios-control-phase1-mobile-20260908`, commit `024bdf9c19a30790f6334e18390ef849a97f1eb5`, clean with no modified or untracked files before implementation. Accepted source audit is reused. No production, native configuration, version, build or OTA operation is authorized.

## Exact initial file plan

- Add `services/iosOperationalPolicyCore.ts`: injected, testable policy client; remembered activation, monotonically accepted revisions, current canonical-ID decisions and playback authorization.
- Add `services/iosOperationalPolicy.ts`: iOS-only transport/storage adapter, existing media identity mapping, policy-change subscription. Other platforms return legacy without storage/network work.
- Add `hooks/useIosOperationalPolicy.ts`: existing screen subscription and section visibility helper.
- Add `scripts/test-ios-operational-policy.ts`: local fake-transport/storage tests for activation, source/section denial, stale/offline failure, playback URL replacement, and non-iOS isolation.
- Modify `app/music-feed.tsx` and `app/more.tsx`: filter existing shortcut definitions and hide disabled music surfaces without replacing navigation or account/support routes.
- Modify `context/PlayerContext.tsx`: narrow authorization before existing play/load/resume/restore paths, pause denied current playback through its existing owner, preserve queue membership and native architecture.
- Modify `context/TvPlaybackContext.tsx`: authorize existing catalog/resolved/seed starts and resume; preserve existing TV session/controls/PiP ownership.
- Modify Sports existing playback entry boundaries only after its current session contract is verified; append exact files before edits.

The parent task owns existing catalog-service adapters and detail/discovery integration and records those separately. No HiddenAudio/native source edits. The parent saves reviewed changes in focused local commits; no push is authorized.

## Additional proven boundaries

Existing cached arrays can remain rendered after a policy revision even when catalog services filter fresh responses. Add a batched visibility hook at these existing cards/rows: `components/catalog/CatalogSongRow.tsx`, `ArtistTrackRow.tsx`, `GenreTrackRow.tsx`, `HomePlaybackRows.tsx`; `components/worlds/WorldTrackRow.tsx`; `components/search/SearchApkSongRow.tsx`; `components/tv/TvVideoCard.tsx`, `TvChannelCard.tsx`; `components/radio/RadioBrowserCards.tsx`; `components/podcast/PodcastCards.tsx`; `components/sports/SportsMatchCard.tsx`.

Add `components/IosOperationalRouteBoundary.tsx` around the existing stack child in `app/_layout.tsx`: a visibility mask leaves the mounted stack/providers/route state intact, protects existing detail/deep-link content, and leaves account/privacy/navigation safe. It is inert on other platforms. No root-stack screens or navigation behavior are rewritten. Existing artist profiles remain intact while their track rows are filtered. The current route mask is necessary because several detail domains use their own layouts rather than AppShell.

Modify `app/sports/player/[fixtureId].tsx` for a commit-time canonical fixture authorization and current-owner revocation monitor. Keep native/embedded player controls unchanged; those surfaces have bounded JS revocation coverage rather than a claim of instantaneous native-buffer revocation.

Saved collections use custom rows too: add `components/IosOperationalItemGate.tsx` and wrap content rows in `app/favorites.tsx`, `app/recently-played.tsx`, `app/playlist/[id].tsx`. These mask unavailable items without removing stored references or changing queue membership; saved artist/album containers remain intact. Update `services/playback/radioPlaybackAdapter.ts` to preserve the proven Radio Browser versus catalog identity marker; `services/radio/radioPlaybackSession.ts` already delegates to that adapter and needs no separate edit.

## Order and checks

Policy core + music boundaries first, targeted local tests before TV, then remaining existing owners. Existing mature-podcast source contract baseline: 33 checks pass. Native device/lock-screen/PiP runtime verification is unavailable in this workspace and must not be claimed. Every newly changed boundary is iOS-only; legacy profile behavior and all other platforms remain unchanged.

## Local verification and practical limits

Passed policy client tests for A–F, source isolation, controlled URL replacement, cached/queue/direct-ID refusal, persisted activation, stale/offline failure, explicit deactivation/restart, bounded batches and non-iOS zero-request/storage paths. Existing tests passed: domain queue guards, mature podcast device lock (33), live radio session (16), podcast continuation and show queue bounds, lecture playback binding and queue guard, motivational queue guard, iOS call interruption, TV close transition, safe exit/recent/logo and surface continuity. A full TypeScript `--noEmit --incremental false` check passed after initial integration; repeat only for subsequent changes.

Policy refresh/current-owner checks run every 15 seconds while JavaScript runs and when the app becomes active. Active explicit play/resume requests reauthorize canonical identity; music playback receives the server's controlled URL. A native buffer already playing or an embedded/native Sports control can act while JavaScript is suspended. This implementation does not claim instantaneous buffer revocation or unperformed native runtime coverage. No native dependency, configuration or version changed; shipment compatibility still depends on the verified deployment runtime and is not permission to publish OTA.
# Additional verified cache boundaries

`services/universalSearchService.ts` must filter the existing song backbone before deriving artist/album/genre results and before merging cached result groups. `services/radio/radioHomeLanes.ts` must filter recommended rows restored directly from its cache. These changes preserve the existing caches and ranking logic; only the active iOS returned view is filtered.

TV delivery review requires preserving the authorized `delivery` value in the client core and existing TV owner. Direct delivery binds the existing native/HLS surface to the server URL; YouTube embeds bind the existing WebView surface to the server URL-derived ID. Unsupported generic embeds are refused by that owner before handoff and stay with the separately guarded existing embed route. Add `scripts/test-ios-operational-tv-delivery.ts` to execute the pure owner mapping against direct/embed/stale-ID fixtures. No TV surface or native engine implementation changes.

Cold startup remains closed while the activation marker is being read locally. Once storage proves the device never observed activation, cached UI uses legacy visibility during the network check; playback and fresh catalog requests still await that check. Remembered activation and unreadable storage cannot provisionally fall back.

Final owned-boundary checks passed: `test-ios-operational-policy.ts` (including cold storage/network ordering, delivery validation, one revision retry, and in-flight success after policy outage), `test-ios-operational-tv-delivery.ts`, `test-live-radio-session.mjs` (16), `test-domain-queue-guards.mjs`, `test-tv-close-transition-behavior.mjs`, and `test-tv-surface-continuity-contract.ts`. Full TypeScript `--noEmit --incremental false` and `git diff --check` passed after delivery and cold-start changes. These are local automated checks, not device or deployment approval.

## Final TV entry review: exact follow-up plan

Modify only `context/TvPlaybackContext.tsx`: the existing Retry callback must freshly authorize canonical identity before changing `playerGeneration`, bind the returned direct/embed asset, and reject stale/closed-owner completions. The existing iOS denial path must pause direct playback and blank supported YouTube iframes because their HTML has no `window.togglePlayback` implementation. Keep the current item, queue, presentation, native engine and all other platform paths intact. Add `scripts/test-ios-operational-tv-entry.ts` to execute the actual Retry callback and denial helper with local stubs, proving denial cannot remount a cached URL and an iframe is stopped while JavaScript is available. No adapter or native/config edits.

Follow-up passed: the actual Retry/resume callbacks reject delayed results after a session/request/owner replacement even when the canonical ID is unchanged; a denied Retry can recover after re-enabling with a newly authorized URL, while retaining queue, item and presentation. The injected denial script blanks the supported iframe even without a toggle API or successful iframe command. `test-ios-operational-tv-entry.ts`, `test-ios-operational-tv-delivery.ts`, TV close-transition/surface-continuity tests, full TypeScript no-emit and whitespace checks passed. Native buffering/suspended-JavaScript behavior remains outside this local proof.
