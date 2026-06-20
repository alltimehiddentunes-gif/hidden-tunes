# Video Provider Foundation

## Current Source Support

Hidden Tunes TV continues to use the existing backend catalog endpoint:

- `https://admin.hiddentunes.com/api/tv/videos`
- `services/tvCatalogApi.ts`
- `/youtube-feed`
- `/youtube-player`

Phase 4A adds a provider-aware foundation without adding new video sources. Existing YouTube TV records still open in the current WebView player route.

## Supported Provider Rules

All backend TV records normalize into one `VideoItem` shape through `services/videos/videoNormalizer.ts`.

Supported source values:

- `youtube`
- `archive`
- `vimeo`
- `dailymotion`
- `twitch`
- `direct`
- `backend`

Playback rules for this phase:

- YouTube uses the existing `/youtube-player` WebView iframe path.
- Embed URLs are preserved internally for future provider-aware playback.
- Source URLs are preserved internally as source/playback metadata, not shown in user-facing UI.
- Thumbnails are provider-aware:
  - YouTube falls back to `https://img.youtube.com/vi/{id}/hqdefault.jpg`.
  - Other providers use `thumbnail_url` or the app-safe fallback artwork.

## Unsupported Behavior

Non-YouTube sources can now normalize and route through the existing opener, but they do not receive new playback support in Phase 4A.

If a provider is not safely playable by the current WebView route, `/youtube-player` shows a friendly unavailable state instead of trying to extract audio, use HiddenAudio, or expose provider/debug details.

## HiddenAudio Boundary

HiddenAudio is intentionally untouched.

The video foundation does not:

- add YouTube audio playback;
- route video records into HiddenAudio;
- change music playback;
- change radio playback;
- change podcast playback;
- change the queue engine.

The existing video route still stops normal native audio on entry before attempting video playback.

## User-Facing Metadata

Video cards and search results should show only clean display metadata:

- title
- creator/channel
- category, format, or genre
- thumbnail

They should not show:

- raw provider labels;
- backend/API names;
- raw IDs;
- `source_url`;
- `embed_url`;
- source debug text.

## Next Source Expansion Plan

Next phases can add providers without creating a second video system:

1. Add provider-specific playback adapters behind the existing `/youtube-player` route.
2. Enable safe iframe playback for Vimeo, Dailymotion, and Twitch only when embed URLs are allowed.
3. Add Internet Archive concert discovery through the existing TV catalog metadata path.
4. Add artist channel feed discovery by writing normalized records to the same backend TV endpoint.
5. Add trending music video discovery as curated TV catalog lanes, not a separate feed.
