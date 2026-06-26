# Podcast Final Device Fix Report

Date: 2026-06-22

## Root cause

Podcast home previously attempted RSS discovery on mount, which blocked the JS thread on mobile and caused heat, freezing, and stuck loading. Category rails also rendered empty rooms, and playback did not queue episodes for auto-next within a show.

## Fixes applied

### Performance

- `ENABLE_PODCAST_RSS_HOME_LOADING = false`
- `ENABLE_PODCAST_RSS_SEARCH = false`
- `PODCAST_SHOW_EPISODE_LIMIT = 10`
- `PODCAST_FEED_TIMEOUT_MS = 5000`
- Home and search are seed-metadata only
- RSS loads on `/podcasts/show/[id]` only (one feed, max 10 episodes, 5s timeout)
- Failed feeds show unavailable state without retry loops

### UX

- Shared `PodcastScreenHeader` with safe-area padding and back navigation
- Local search bar on home, mature, and category screens
- Home sections: Featured, Music, Emotional Worlds, Lifestyle, Global, Language, All Podcasts
- Empty categories hidden dynamically from rails and browse lists
- Deep-linked empty category shows helpful copy + Browse all podcasts
- Mature page shows only non-empty mature categories and grouped mature sections
- Episode cards show duration, date, explicit badge, unavailable state
- Mini player enabled on `/podcasts` route

### Auto-next

- `playPodcastEpisodeFromShow()` builds a standard queue (max 10 playable episodes)
- Uses existing `playSong(..., "standard")` — no `activeQueueMode: "podcast"`
- Tap episode N → plays N, then auto-advances through loaded show episodes

### Diagnostics (dev-only)

- `podcast_static_home_rendered`
- `podcast_home_rss_disabled`
- `podcast_category_hidden_empty`
- `podcast_search_started`
- `podcast_search_results`
- `mature_podcast_category_hidden_empty`
- `podcast_show_feed_load_start`
- `podcast_show_feed_load_success`
- `podcast_show_feed_load_failed`
- `podcast_show_feed_timeout`
- `podcast_episode_play_start`
- `podcast_episode_play_failed`
- `podcast_auto_next_queue_created`

## Files changed

- `services/podcastService.ts`
- `hooks/usePodcastHome.ts`
- `hooks/usePodcastLocalSearch.ts`
- `hooks/usePlaybackRouter.ts`
- `utils/podcastPlayback.ts`
- `utils/podcastNavigation.ts`
- `utils/podcastDiagnostics.ts`
- `components/podcast/PodcastScreenHeader.tsx`
- `components/podcast/PodcastSearchBar.tsx`
- `components/podcast/PodcastSearchResults.tsx`
- `components/podcast/PodcastEmptyCategoryState.tsx`
- `components/podcast/PodcastCards.tsx`
- `components/navigation/AppShell.tsx`
- `app/podcasts/index.tsx`
- `app/podcasts/mature.tsx`
- `app/podcasts/category/[id].tsx`
- `app/podcasts/show/[id].tsx`
- `app/podcasts/episode/[id].tsx`

## Validation

```bash
npm run typecheck
git diff --check
git status --short
```

## Device QA checklist

- Home opens instantly, no heat while idle, search visible, header safe
- Search matches TED, BBC, Huberman, Lex with no RSS while typing
- No empty category cards; deep-link empty room shows helpful state
- Mature locked by default; unlock shows only populated mature sections
- Show page loads one feed; episodes play; MiniPlayer appears; auto-next works
- Music, radio, queue, favorites, HiddenAudio unchanged

## Scale note

Large-scale podcast ingestion belongs in backend/admin pipeline, not the mobile bundle.
