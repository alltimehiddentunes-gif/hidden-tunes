# YouTube Dormant Key Removal Report

## Scope and finding

The mobile repository contained a tracked Google API key in `constants/youtube.ts`. The only runtime consumer was the dormant YouTube Data API discovery helper. Discovery was already disabled by a hard-coded `YOUTUBE_DATA_API_ENABLED = false` guard.

Working TV uses the Hidden Tunes admin catalog, and known YouTube IDs play through the existing WebView player. Neither path consumes the Google API key.

## Repair

- Removed the literal credential from tracked mobile source.
- Replaced the optional key field with `undefined`.
- Exported the explicit disabled flag from the configuration module.
- Added a fail-closed return before URL construction reads credential-backed configuration.
- Added a focused security regression test covering source, TV independence, and known-ID WebView independence.

## Preserved behavior

- TV catalog through `admin.hiddentunes.com`
- known-ID YouTube WebView playback
- Music, live Radio, Podcasts, Audiobooks, Motivationals, Lectures, Sports, Search, and background playback

## Intentionally disabled behavior

- YouTube Data API search
- channel-feed discovery
- related-video discovery
- legacy artist YouTube results
- Radio's YouTube fallback

## History and operations

The old credential remains in shared Git history and must still be rotated or revoked operationally. History was not rewritten. No replacement client key was introduced and no `.env` file was used as concealment.

## Validation and delivery

Validation results:

- Secret scan: passed; zero Google API key literals in current tracked source and reviewed security files
- TypeScript: passed
- Targeted ESLint: passed
- Focused dormant-key security contract: passed
- Metro iOS bundle: HTTP 200; zero Google API key literals; disabled marker and known-ID player marker present
- TV media-session and tap contracts: passed
- Known-ID WebView independence: passed by focused source/bundle contract
- Radio performance and station-switch contracts: passed
- Main Search cold-start and restoration contracts: passed
- Playback handoff contract: passed
- Sports frontend contract: passed
- Expo Doctor: 21/21 passed
- Expo dependency check: passed
- Resolved public Expo config: passed with dotenv disabled after the local `.env` file returned an environment-level `EPERM`

Delivery:

- Security commit SHA: `944170e822d44b7bd35ef3d58b2582b1e39151d6`
- Push: succeeded normally to `origin/fix/library-content-type-safe`
- Launch-readiness audit: resumed after the security repair; remaining audit work continues from `audit/launch-readiness/`
- Prohibited operations: no history rewrite, force-push, backend deployment, migration, OTA publish, or native build occurred
