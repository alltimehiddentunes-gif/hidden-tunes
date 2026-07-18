# CarPlay Production Readiness

## Apple approval status

- **CarPlay Audio App** entitlement: approved
- **CarPlay Video** entitlement: approved but **not enabled** in this implementation
- First ship phase: **CarPlay Audio only**

## Exact bundle identifier

`com.hiddentunes.app`

Confirmed in:

- `app.json` → `expo.ios.bundleIdentifier`
- `app.config.js` (spreads `app.json`)
- `ios/HiddenTunes.xcodeproj/project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER`
- Display name: **Hidden Tunes** (`CFBundleDisplayName`)

## Exact entitlement used

```
com.apple.developer.carplay-audio = true
```

Source of truth for regeneration:

1. `plugins/hidden-audio/index.js` → `withHiddenAudioEntitlements`
2. `app.json` → `expo.ios.entitlements`
3. Generated/current: `ios/HiddenTunes/HiddenTunes.entitlements`

CarPlay Video is intentionally omitted.

## Files changed (this preparation)

### Config / signing surface

- `app.json`
- `plugins/hidden-audio/index.js`
- `ios/HiddenTunes/HiddenTunes.entitlements`
- `ios/HiddenTunes/Info.plist`
- `ios/HiddenTunes.xcodeproj/project.pbxproj`

### Native CarPlay scene + templates

- `plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift`
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift`
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift`
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift`
- Mirrored under `ios/HiddenTunes/HiddenAudioModule/`

### JS catalog + playback bridge

- `services/carPlayCatalogBridge.ts`
- `context/PlayerContext.tsx` (CarPlay media-id resolution only)
- `src/hidden-audio/hiddenAudioBridge.ts` (existing `syncHiddenAudioCarPlayCatalog`)

### Docs

- `docs/carplay-production-readiness.md` (this file)
- `docs/carplay-portal-checklist.md`
- `docs/carplay-video-follow-up.md`

## Native architecture

```
CPTemplateApplicationScene
  └─ CarPlaySceneDelegate
       └─ HiddenAudioCarPlayManager
            ├─ CPTabBarTemplate
            │    ├─ Hidden Tunes (Now Playing / Recently Played / Favorites)
            │    ├─ Playlists
            │    ├─ Music
            │    ├─ Radio
            │    └─ Search (CPSearchTemplate)
            ├─ CPListTemplate children
            ├─ CPNowPlayingTemplate.shared
            └─ HiddenAudioCarPlayCatalog (bounded snapshot)
```

Phone launch path remains Expo/`AppDelegate` — only the CarPlay role is declared in the scene manifest.

## Scene manifest design

`UIApplicationSceneManifest` declares **only**:

- Role: `CPTemplateApplicationSceneSessionRoleApplication`
- Class: `CPTemplateApplicationScene`
- Config name: `HiddenTunesCarPlay`
- Delegate: `$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate`

No duplicate phone-scene rewrite. CarPlay is optional; missing CarPlay does not block cold launch.

## Catalog bridge design

`services/carPlayCatalogBridge.ts` builds a bounded snapshot:

| Section | Limit |
|--------|-------|
| Recently Played | 25 |
| Favorites | 25 |
| Playlists | 20 |
| Playlist tracks | 50 each |
| Music | 50 |
| Radio stations per bucket | 25 |
| Search results | 30 |

Rules:

- Cached-first (derived catalog, AsyncStorage favorites/recent, radio cache)
- Soft-fail on empty/error with premium empty copy (“Nothing here yet” / “Hidden Tunes”)
- Deduped tracks, no provider branding
- Synced to native via `syncCarPlayCatalog` → `ios_carplay_catalog_synced`

## Playback ownership

CarPlay **does not** own a second player.

- Shared engine: existing `HiddenAudio` AVPlayer
- Selection emits `ios_remote_command_received` / `play_from_media_id`
- `PlayerContext` resolves via `resolveCarPlayMediaId` then `playSong(...)`
- Radio uses `live_stream` queue mode through the existing path
- Disconnect releases CarPlay UI refs only — audio continues
- Lock screen / MiniPlayer / remote commands remain the existing HiddenAudio path

## Search behavior

- Native `CPSearchTemplate` searches the synced track registry first
- Bounded to 30
- Empty query → empty list; no dead crash screen
- Failures stay inside CarPlay templates

## Radio behavior

Radio root buckets:

Recently Played Radio, Favorites, Country, Gospel, Afrobeats, Jazz, News, Global, Focus, Faith

Stations come from launch-ready caches. Selection uses `radio:` media IDs and `live_stream` playback — not mixed into the song queue incorrectly.

## Signing steps

1. Confirm App ID `com.hiddentunes.app` has **CarPlay Audio App** enabled in Apple Developer Portal
2. Regenerate Development + Distribution provisioning profiles **after** entitlement save
3. Install/select the new profiles in Xcode / EAS credentials
4. Build (later — not in this task)

## Provisioning-profile steps

See `docs/carplay-portal-checklist.md`.

Do **not** reuse a profile created before the entitlement was enabled on the App ID.

## Entitlement verification commands

After an iOS build artifact exists:

```bash
codesign -d --entitlements :- /path/to/HiddenTunes.app
```

Expected:

```xml
<key>com.apple.developer.carplay-audio</key>
<true/>
```

Also inspect the embedded profile:

```bash
security cms -D -i /path/to/HiddenTunes.app/embedded.mobileprovision | grep -A2 carplay-audio
```

## Manual test plan

### iPhone without CarPlay

- Cold launch / warm launch
- Home opens
- Search opens
- Song plays
- MiniPlayer works
- Background playback works
- Lock-screen works
- Auto-next works
- Phone call interruption works
- Bluetooth reconnect works

### CarPlay

- Hidden Tunes icon appears on CarPlay home
- App opens to Hidden Tunes templates
- Now Playing / Recently Played / Favorites / Playlists / Music / Radio / Search
- Song + radio selection work
- Play/pause, previous/next
- Artwork + queue + auto-next stay in sync with phone + lock screen
- Incoming call pauses correctly; resume when appropriate
- Disconnect preserves playback; reconnect restores CarPlay UI state

## Known risks

1. App ID entitlement must be enabled manually — account approval alone is not enough
2. Old provisioning profiles lack the entitlement and will produce a binary without CarPlay home icon
3. CarPlay Simulator behavior can differ from a real head unit
4. Empty radio buckets until category caches warm
5. Search is local/synced-catalog first; unbounded multi-provider search is intentionally avoided

## Rollback instructions

1. Revert this branch / restore prior `plugins/hidden-audio/index.js` entitlement + scene behavior
2. Remove `com.apple.developer.carplay-audio` from entitlements
3. Remove CarPlay scene from Info.plist
4. Rebuild with regenerated profiles if needed

Phone playback is unchanged by design; rollback should not require PlayerContext rewrites beyond removing the CarPlay media-id resolver path.

## Exact remaining step before build

1. Complete Apple Developer Portal App ID enablement + profile regeneration (`docs/carplay-portal-checklist.md`)
2. Confirm EAS/Xcode credentials pick up the new CarPlay-enabled profiles
3. Then run the next iOS build (explicitly instructed later)

**Code-level preparation for CarPlay Audio is complete.** The next properly signed iOS build must include the entitlement + real template scene so the Hidden Tunes icon can appear on the car screen.
