# Desktop Audio Quality Upgrade Plan

## Current Architecture Summary

- Initial desktop playback is coordinated in `src/context/DesktopPlaybackProvider.tsx`.
- When a song is played, `playSong(song)` calls `selectPlayableUrlForQualityMode(song, audioQualityMode)` from `src/lib/audioVersions.ts`.
- The quality selector currently affects only the first playable URL choice. The fallback order is explicit per mode and still preserves legacy `audioUrl` fallback.
- The selected URL is passed to `HtmlAudioPlaybackService.play(url, { instant: true })` in `src/lib/desktopPlayback/HtmlAudioPlaybackService.ts`.
- `HtmlAudioPlaybackService.play` sets `audio.src`, calls `audio.load()`, then `audio.play()` when the URL changes. Changing source directly resets browser media loading state and can reset current position unless position is explicitly restored.
- `HtmlAudioPlaybackService.upgradeSource(url)` already captures `currentTime`, swaps `src`, waits for `canplay`, restores `currentTime`, and resumes if the old source was playing. It uses an `upgradeToken` to ignore stale upgrade completions.
- `DesktopPlaybackProvider.playSong` currently resolves `resolveUpgradePlayUrl(song, instantUrl)` and invokes `service.upgradeSource(upgradeUrl)` immediately after initial play resolves. A future automatic upgrade phase should replace this simple immediate path with guarded upgrade policy rather than adding a second competing upgrader.

## Risks

- Source swaps reset media state unless position, playing state, and load lifecycle are explicitly managed.
- Upgrading too early can compete with instant-start and cause perceived startup delay or buffering.
- Upgrade attempts during seeking can restore an outdated position or fight the user gesture.
- Failed high-quality or standard sources can accidentally stop good ultraLight playback if errors are not isolated.
- Repeated errors or mode changes can create upgrade loops without per-track/per-target attempt state.
- Browser media events can arrive out of order after a source swap, especially when queue auto-advance, manual next/previous, or seek occur during an upgrade.
- `resolveUpgradePlayUrl` currently prefers `highQuality`, `highQualityUrl`, then `audioUrl`; future logic must align with the explicit quality mode fallback model in `audioVersions.ts`.

## Proposed Phased Implementation

### Phase 1: Make Upgrade Candidates Explicit

- Add a helper in `src/lib/audioVersions.ts` that returns an ordered upgrade candidate list for the current song, selected quality mode, and currently playing tier/url.
- Keep ultraLight instant-start as the first playback path for Auto and Data Saver where applicable.
- For Standard and High Quality, start with the best available selected initial URL using existing quality-aware selection, then only upgrade when the candidate is strictly better than the active tier.
- Include tier metadata with the active playback state so the provider knows whether the current source is `ultraLight`, `standard`, `highQuality`, `lossless`, `previewUrl`, or `legacyAudioUrl`.

### Phase 2: Add Guarded Upgrade State

- Track upgrade state in `DesktopPlaybackProvider` or inside `HtmlAudioPlaybackService`: active track id, active url, active tier, attempted upgrade urls, failed upgrade urls, and upgrade-in-progress flag.
- Do not start an upgrade while the user is seeking, while loading the first source, while paused before first play, or after queue navigation has changed the active track.
- Use a monotonically increasing token per track/source attempt. Existing `upgradeToken` can remain the service-level cancellation primitive.
- Add a short debounce after initial `canplay` or first `timeupdate` so ultraLight instant-start remains visibly instant.

### Phase 3: Preserve Position And Recover Safely

- Before source swap, snapshot `currentTime`, `paused`, `currentSrc`, and active track id.
- Use `upgradeSource` as the base primitive, but return richer results such as `applied`, `skipped`, or `failed` with the failed URL/tier.
- If upgrade load or play fails, keep the existing lower-quality source playing whenever possible. If the browser has already abandoned the old source, immediately restore the previous URL and saved position.
- Mark failed target URLs for the current track/session so they are not retried repeatedly.

### Phase 4: Integrate With Seeking And Queue Events

- Expose seeking state from the progress pointer handlers or add service-level seek notifications.
- Suppress upgrades between pointer down and pointer up/cancel on the progress bar.
- Cancel pending upgrades on next, previous, auto-advance, manual play, stop, and quality mode change.
- Re-evaluate upgrade candidates only after the active track and current source are stable.

### Phase 5: Diagnostics And Test Coverage

- Keep diagnostics dev-only and quiet in production.
- Log selected initial tier, attempted upgrade tier, applied/failed/skipped result, and reason for skip.
- Use the existing dev audio version harness songs to test full-tier, lean-tier, high-only, and legacy-only cases.

## Files Likely Involved

- `src/lib/audioVersions.ts`: upgrade candidate helper, tier ordering, active tier comparison.
- `src/context/DesktopPlaybackProvider.tsx`: upgrade policy orchestration, track-level attempt state, cancellation on queue/seek/mode changes.
- `src/lib/desktopPlayback/HtmlAudioPlaybackService.ts`: richer upgrade result, safer fallback restoration, source-swap state handling.
- `src/lib/songMetadata.ts`: likely remove or narrow `resolveUpgradePlayUrl` once the new `audioVersions` helper owns upgrade candidate selection.
- `src/lib/catalogDiagnostics.ts`: optional dev-only upgrade diagnostics.
- `src/lib/devAudioVersionTestHarness.ts`: dev-only verification data.

## Rollback Strategy

- Keep the first implementation behind a single desktop-only feature flag or local constant, for example `ENABLE_DESKTOP_AUTO_QUALITY_UPGRADE`.
- If issues appear, disable the flag so playback returns to current initial URL selection only.
- Preserve `selectPlayableUrlForQualityMode` and the quality selector; rollback should not remove UI/state foundation.
- Avoid database, backend, mobile, or catalog format changes so rollback is a one-commit desktop revert if needed.

## Validation Checklist

- Build passes with `npm run build`.
- Auto mode still starts instantly on ultraLight or preview when available.
- Data Saver never upgrades beyond standard/audioUrl.
- Standard can recover from missing or failing standard by continuing fallback playback.
- High Quality can attempt highQuality without breaking lower-tier fallback.
- Legacy-only songs still play using `audioUrl`.
- Seeking during a pending upgrade does not jump backward or forward unexpectedly.
- Next, previous, and auto-advance cancel stale upgrade attempts.
- Failed upgrade URL is not retried in a loop for the same track/session.
- Paused playback remains paused after a successful source swap unless it was playing before the upgrade.
- Dev diagnostics show upgrade decisions only in development.
