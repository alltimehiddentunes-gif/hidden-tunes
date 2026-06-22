# Podcast Premium Audit

## Sections Added Or Verified

- Featured Podcasts: existing cache-first home lane, hidden when empty.
- Trending Podcasts: existing cache-first home lane, hidden when empty.
- Popular Podcasts: existing cache-first home lane, hidden when empty.
- Recently Played Podcasts: existing local-history lane, hidden when empty.
- Recommended Podcasts: built from featured/trending plus recent-show exclusions, hidden when empty.
- Emotional Podcasts: availability-filtered lanes for Heartbreak Recovery, Night Drive, Sunday Worship, Deep Focus, Afro Heat, Hidden Treasures, and World Stories.
- Browse Categories: availability-filtered categories for Business, Technology, Health, Relationships, Faith, African Voices, History, Science, Finance, True Crime, Comedy, and News.
- Adult Podcasts: availability-filtered mature section shown only when mature content is enabled and consent is confirmed.

## Adult Podcast Gating

- Mature podcasts remain hidden by default because `includeMatureInApi` requires both enabled mature settings and consent.
- Adult Podcast rooms are rendered only after mature access is active.
- Tapping an adult podcast category still goes through `runWithMatureConsent`.
- Mature shows and episodes continue to use the existing `MatureContentBadge` path, so 18+ badges render from the same mature-content model.
- Mature categories are not mixed into normal browse categories unless the mature gate is active, and mature results remain filtered from podcast search when the mature gate is off.

## Category Filtering

- Home browse, emotional, and adult categories are filtered through `filterAvailablePodcastCategoryIds`.
- Empty category cards are not shown on the Podcast home.
- The mature hub now filters adult subcategories before rendering, avoiding dead-end mature rooms.
- Category detail screens continue to redirect back to Podcasts if a category resolves to no shows after loading.

## Heat And Fetch Findings

- Existing podcast discovery already used cache-first reads, lazy first-page hydration, inflight dedupe, 40/page pagination, and request-generation guards.
- Main podcast lanes fetch first; category availability probes run only after the primary home lanes have painted.
- Availability probes are concurrency-limited to two at a time.
- The lazy podcast list now guards refresh and load-more spinner finalizers after unmount to avoid stale async state updates after navigation.
- Search already defers podcast/radio sections until after the main music search path, preserving music-first priority.

## Manual QA Checklist

- Podcast page opens without a black page.
- Featured Podcasts render when populated.
- Trending and Popular render when populated.
- Recently Played and Recommended render when populated.
- Emotional Podcasts show only available lanes.
- Browse Categories show only available categories.
- Adult Podcasts are hidden by default.
- Enable mature content and confirm the 18+ consent prompt.
- Adult Podcasts become visible when populated.
- Mature shows and episodes display 18+ badges.
- Podcast show opens.
- Podcast episodes open.
- Podcast episode playback still works through existing podcast playback.
- Load next 40 works on category and search lists.
- Pull refresh works on category lists.
- Main search keeps music first and podcasts lower in the results.
- Radio and music still work.

## Remaining Risks

- Availability depends on the backend returning real podcast data for each category query and fallback query.
- The mature section will stay hidden if the backend has no available mature podcast matches.
- Manual device QA is still required for temperature, scroll smoothness, and long-session behavior.
