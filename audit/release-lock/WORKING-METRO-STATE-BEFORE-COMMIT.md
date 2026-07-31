# Working Metro State — Before Commit Snapshot

| Field | Value |
| --- | --- |
| Date/time | 2026-07-31 23:28:19 +02:00 |
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| Current HEAD | `8e9ad68ee55202a7bc83dd355d76f2e652675efc` |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Upstream | `origin/fix/library-content-type-safe` |
| Ahead/behind | `0 0` (already synced) |
| Metro port | `8081` |
| Metro root | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Metro command | `expo start --dev-client --port 8081` |
| Metro PID | `15472` |

## Dirty / untracked at snapshot

Tracked dirty diff: **empty** (0 bytes) — working Metro features already present in HEAD.

Untracked:

- `audit/build-mature-podcast/` (documentation/report from mature build audit)

Ignored local environment files (not committed):

- `.env`
- `.env.local`
- `.expo/`

## Known working features (Metro-approved by user)

### Podcasts

- Mature/+18 section after age gate
- Mature catalog pagination to full eligible catalog
- `includeMature=true` on episode requests
- Reported shows return episodes
- Play Latest / Shuffle
- Same-show auto-next + same-category fallback
- Mature continuation remains mature-only
- Manual stop prevents continuation
- Playback ownership retained in PlayerContext / HiddenAudio

### Sports

- Sport filters
- 2-column phone grid
- Upcoming / Results
- Live Sports TV shelf via canonical TV API
- TV card handoff to existing TV player
- No duplicate Sports player
- Fixture streams disabled
- Quarantined broadcasts ineligible

## Files excluded from commit (local-only)

| Path | Reason |
| --- | --- |
| `.env` | local environment / secrets |
| `.env.local` | local environment / public flags + secrets |
| `.expo/` | generated cache |
| `node_modules/` | dependencies |

## Local public flag names (values redacted where sensitive)

From `.env.local` public Sports / build flags (names only; values as non-secret booleans already used for Metro):

- `EXPO_PUBLIC_SPORTS_ENABLED=true`
- `EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED=true` (Metro-only; production EAS keeps `false`)
- `EXPO_PUBLIC_SPORTS_MOBILE_PILOT_ENABLED=true`
- `EXPO_PUBLIC_SPORTS_FULL_UI_ENABLED=true`
- `EXPO_PUBLIC_SPORTS_HOME_IA_ENABLED=true`
- `EXPO_PUBLIC_SPORTS_STREAMS_ENABLED=false`
- `EXPO_PUBLIC_SPORTS_TV_ENABLED=true`
- `EXPO_PUBLIC_SPORTS_LIVE_SCORES_ENABLED=false`
- `EXPO_PUBLIC_SPORTS_NOTIFICATIONS_ENABLED=false`
- `EXPO_PUBLIC_SPORTS_NATIVE_PLAYBACK_ENABLED=false`
- `EXPO_PUBLIC_SPORTS_EMBEDDED_PLAYBACK_ENABLED=false`
- `EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES=false`
- `EXPO_PUBLIC_SPORTS_ENABLE_TEST_PLAYER=false`
- `EXPO_PUBLIC_SPORTS_PRIVATE_PILOT_TOKEN=(redacted)`

Production-tracked equivalents live in `eas.json` production `env` (Sports TV on; fixtures/streams/notifications/dev fixtures off).
