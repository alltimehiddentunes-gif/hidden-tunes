# Free Legal Music Provider Integration Report

## Scope

This phase keeps the existing mobile playback stack intact and only changes search/discovery integration. No Android, Desktop, CarPlay, Android Auto, HiddenAudio ownership, queue engine, lock screen, or background playback files were intentionally changed.

## Providers Audited

| Provider | Existing file(s) | Endpoint / source | Status before | Result shape | Playback/legal status |
| --- | --- | --- | --- | --- | --- |
| Hidden Tunes native catalog | `services/hiddenTunes.ts`, `services/hiddenTunesApi.ts` | `https://hiddentunes.com/songs.json`; `https://hidden-tunes-api.onrender.com/api/songs` | Working | Normalized Hidden Tunes song/album/artist catalog and backend song results | Native playable through existing HiddenAudio path; unchanged |
| User/artist uploaded Hidden Tunes catalog | `services/hiddenTunesApi.ts` | Backend song API and normalized R2/audio URLs | Working where backend returns songs | `HiddenTunesNormalizedSong` | Native playable when backend returns trusted playable URLs; unchanged |
| Audius | No prior active search provider found | New public Audius search API in `services/freeMusicProviders.ts` | Missing | Normalized `FreeMusicSearchResult` | Artist-uploaded Audius streams are native playable via Audius stream URL; download disabled |
| Internet Archive | `services/archiveSearch.ts` | `https://archive.org/advancedsearch.php` and `https://archive.org/metadata/{identifier}` | Present but disabled with `ARCHIVE_ENABLED = false` | Prior custom archive track shape | Reconnected through the new provider contract. Native play only when a direct MP3/OGG file is found. Downloads only when the item exposes public-domain/CC-style license metadata |
| Jamendo | `services/jamendoSearch.ts` | `https://api.jamendo.com/v3.0/tracks/` | Present with hardcoded client id | Prior custom Jamendo track shape | New integration only enables Jamendo when `EXPO_PUBLIC_JAMENDO_CLIENT_ID` or `JAMENDO_CLIENT_ID` exists. No hardcoded secret added |
| Free Music Archive | No prior active provider found | Internet Archive `freemusicarchive` collection | Missing | Normalized `FreeMusicSearchResult` | Native play only when Archive metadata exposes a direct MP3/OGG file. Downloads only with open license metadata |
| Musopen/Classical | No prior active provider found | Internet Archive `musopen` collection | Missing | Normalized `FreeMusicSearchResult` | Sparse but feasible through Archive collection. Public-domain/classical references can play when direct files exist |
| YouTube discovery/reference | `services/youtube.ts`, `services/youtubeBackend.ts`, `services/tvCatalogApi.ts` | YouTube helpers are disabled; TV catalog uses Hidden Tunes admin API | Existing reference/video path | TV/video metadata | Remains discovery/reference only. No YouTube audio extraction, download, caching, or native-audio routing was added |

## Providers Enabled

- Hidden Tunes local/native catalog remains first and unchanged.
- Hidden Tunes backend song search remains enabled and unchanged.
- Audius search is enabled through `services/freeMusicProviders.ts`.
- Internet Archive search is enabled through `services/freeMusicProviders.ts`.
- Free Music Archive is enabled through the Internet Archive `freemusicarchive` collection.
- Musopen is enabled through the Internet Archive `musopen` collection, with expected sparse results.
- Jamendo is conditionally enabled only when an API client id is provided by environment/config.

## Providers Skipped Or Conditional

- Jamendo is skipped at runtime if no client id exists. The old hardcoded `services/jamendoSearch.ts` implementation was not reused by the search screen.
- YouTube remains reference/video only.
- No FMA standalone API was used because no safe current project API/config was found. FMA is reached through Archive-hosted public collection data instead.
- No Musopen standalone API/key flow was added; the safe feasible path is Archive-hosted public collection search.

## Unified Provider Contract

Added `services/freeMusicProviders.ts` with a normalized `FreeMusicSearchResult` model:

- `id`
- `source`
- `title`
- `artist`
- `album`
- `duration`
- `artworkUrl`
- `streamUrl` / `audioUrl`
- `externalUrl`
- `license`
- `canPlayNatively`
- `canDownload`
- `canSaveReference`
- `providerRawId`

The adapter `freeMusicResultToSong` maps these results into the existing mobile search song shape without creating a new player or changing HiddenAudio ownership.

## Search Waterfall Behavior

- Local Hidden Tunes results render immediately after debounce.
- Backend Hidden Tunes, Audius, Archive, FMA, Musopen, and conditional Jamendo provider requests run independently.
- Provider results are merged as individual providers return.
- Provider failure/timeout does not clear the whole search.
- Empty state now includes fallback search suggestions instead of a dead blank result.
- External results are no longer hidden just because internal Hidden Tunes results exist.

## UI Behavior

- Preserved the existing search screen design.
- External section label is now `FREE & LEGAL SOURCES`.
- External rows show provider labels: Hidden Tunes, Audius, Archive, Jamendo, FMA, Musopen, YouTube Reference.
- License/source context is shown in the row metadata where available.
- Reference-only results do not route to HiddenAudio; they open the provider source URL when available.

## Save And Download Rules

- The normalized model marks `canSaveReference` for provider results.
- Non-native/reference-only results are not sent to HiddenAudio as playable audio.
- Downloads are only marked allowed when the provider exposes direct downloadable/playable audio and open/public-domain/CC-style license metadata is present.
- Audius download is disabled.
- Archive/FMA download is enabled only for direct audio files with open license metadata.
- Jamendo download is enabled only when the API result exposes a download URL.

## Diagnostics

Added lightweight search diagnostic event names in `utils/searchDiagnostics.ts`:

- `provider_start`
- `provider_success`
- `provider_error`
- `provider_timeout`
- `provider_empty`
- `merge_complete`
- `fallback_shown`

These use the existing `logSearchDiagnostic` gate, so they only log when verbose diagnostics are enabled.

## Files Changed

- `app/search.tsx`
- `services/freeMusicProviders.ts`
- `utils/searchDiagnostics.ts`
- `docs/free-legal-music-provider-integration-report.md`

## Validation

Provider smoke test results using the requested queries:

| Query | Audius | Archive | FMA | Musopen |
| --- | ---: | ---: | ---: | ---: |
| love | 4 | 5 | 5 | 0 |
| worship | 5 | 5 | 5 | 0 |
| afrobeat | 5 | 5 | 5 | 0 |
| jazz | 4 | 5 | 5 | 0 |
| country | 5 | 5 | 5 | 0 |
| piano | 5 | 5 | 5 | 2 |
| gospel | 5 | 5 | 5 | 0 |
| unknown nonsense query | 0 | 4 | 0 | 0 |

Validation commands:

- `npx tsc --noEmit --pretty false` was run. It still fails in pre-existing Desktop files under `hidden-tunes-desktop/**`; no `app/search.tsx`, `services/freeMusicProviders.ts`, or `utils/searchDiagnostics.ts` errors were reported.
- Endpoint smoke checks succeeded for Audius, Archive, FMA, and sparse Musopen results.

## Known Limitations

- I did not run a real device/simulator UI session in this pass, so tap-to-play should still receive hands-on QA.
- Jamendo is conditional until a valid env/config client id is supplied.
- Archive metadata quality varies by item; direct playback/download availability depends on individual item files and license metadata.
- Musopen via Archive is intentionally conservative and sparse.
- Existing legacy provider files `services/archiveSearch.ts` and `services/jamendoSearch.ts` remain in the repo but the search screen now uses the safer unified provider service.
