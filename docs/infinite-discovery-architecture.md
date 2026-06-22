# Infinite Discovery Architecture

## Core Model

Infinite Discovery means the app never tries to load an entire radio or podcast universe. Discovery pages request one page at a time, with MEDIA_DISCOVERY_PAGE_SIZE as the shared 40-item limit.

The user experience is continuous: first 40, then next 40, then next 40. The app experience stays light because every category, search result, and mature room uses cache-first reads, inflight request dedupe, stale request guards, and paged backend/source calls.

## Radio Architecture

Radio discovery uses the existing station architecture:

- Home lanes: Featured, Trending, Popular, Recently Played, Recommended.
- Browse: Countries, Languages, Genres, Faith, Sports, News, African Radio, Adult Radio.
- Anti-boredom surfaces: New This Week, Recently Added, Hidden Gems, Editor's Picks, Most Loved, Popular In Your Country, Popular Worldwide.
- Search: /stations/search, backed by loadRadioSearchPage.
- Category pages: /stations/[categoryId], backed by loadRadioCategoryPage.

Every radio category resolves through constants/radioCategories.ts, then loads through services/radio/radioBrowserApi.ts. The API layer clamps each request to 40 items, uses Radio Browser offsets, writes to the radio cache, and returns hasMore when another 40 can be requested.

Radio search no longer has an artificial 200-result cap. It still requests 40 at a time and stops only when the source returns fewer results or hasMore becomes false.

## Podcast Architecture

Podcast discovery uses the existing podcast catalog architecture:

- Home lanes: Featured, Trending, Popular, Recently Played, Recommended.
- Browse: Business, Technology, Health, Relationships, Faith, African Voices, History, Science, Finance, True Crime, Comedy, News.
- New Releases: dedicated 
ew-releases category instead of aliasing to Trending.
- Emotional Podcasts: Heartbreak Recovery, Night Drive, Sunday Worship, Deep Focus, Afro Heat, Hidden Treasures, World Stories.
- Adult Podcasts: mature subcategories behind the mature content gate.
- Anti-boredom surfaces: New This Week, Recently Added, Hidden Gems, Editor's Picks, Most Loved, Popular In Your Country, Popular Worldwide.
- Search: podcast search uses loadPodcastSearchPage and remains below music and video in global search.
- Category pages: /podcasts/[categoryId], backed by loadPodcastCategoryPage.

Podcast pages use backend pagination with page numbers derived from offsets. Each request remains 40 shows. Cache and inflight maps prevent repeated probes from multiplying network work.

## Ranking Signals

Radio ranking is quality-first, using:

- Stream reliability proxies: resolved stream URL, HTTPS stream, supported codec.
- Station popularity: votes and click counts.
- Metadata quality: station name, tags, country, language.
- Audio quality indicators: bitrate and codec.
- Freshness and momentum: top-click and top-vote source ordering where available.
- Language and country relevance: category-specific language, tag, and country queries.

Podcast ranking is quality-first, using:

- Active feed signals: latest published date and recency sorting for New Releases, New This Week, and Recently Added.
- Metadata quality: title, description, host, categories, primary category, language.
- Artwork quality: HTTPS artwork preferred.
- Publishing consistency and depth: episode count.
- Popularity/editorial indicators: featured, exclusive, popular collections.

## Pagination Model

Radio and podcast pagination follow the same pattern:

1. Read first 40 from memory cache.
2. Hydrate first 40 from persisted cache if memory is cold.
3. Fetch first 40 only when cache is absent or stale.
4. On scroll end, request the next 40 with offset/page translation.
5. Append results and dedupe.
6. Keep UI responsive with footer spinners rather than blocking the page.

No discovery route should request 1000+ items, preload full categories, or bulk-load search results at startup.

## Mature Content Handling

Default is OFF.

When mature content is OFF:

- Adult Radio is hidden.
- Adult Podcasts are hidden.
- Mature podcast and radio search results are filtered out.
- Mature API inclusion flags are not sent.

When mature content is ON and consent is confirmed:

- Adult discovery categories become eligible for availability filtering.
- Mature API inclusion flags are sent only for mature routes or mature-enabled discovery.
- Mature radio, podcast shows, and podcast episodes show the existing 18+ badge.
- Mature results remain isolated from normal discovery unless the mature gate is active.

Adult podcast sections include Dating, Relationships, Marriage, Human Behavior, Adult Comedy, After Dark, Real Stories, Unfiltered Interviews, Psychology, and Adult Talk from the existing mature category map.

## Anti-Boredom Layers

Anti-boredom surfaces reuse existing discovery data and loaders:

- Trending Now uses existing trending lanes.
- New This Week and Recently Added use recency-oriented podcast queries and lightweight radio tag queries.
- Hidden Gems uses indie/underrated discovery queries and quality sorting.
- Editor's Picks uses featured/editorial or top-vote sources.
- Most Loved uses popular/high-vote sources.
- Popular In Your Country uses country-scoped station queries and local-relevance podcast queries.
- Popular Worldwide uses global popular/trending sources.

These surfaces are category definitions, not new backend systems. They are availability-filtered before display and each drill-in page keeps the same 40-item pagination model.

## Performance Rules

The architecture preserves:

- 40-item pages.
- Cache-first loading.
- Request dedupe through inflight maps.
- Abortable/stale radio browse requests.
- Request generation guards for stale async updates.
- Unmount guards for refresh and load-more spinner state.
- Deferred podcast/radio global search so music stays first.
- No startup bulk fetch.
- No background polling.

## Manual QA Checklist

- Radio home loads first lanes without a black page.
- Radio category page shows 40 and loads the next 40 on scroll.
- Radio search stays responsive and loads the next 40 on scroll.
- Podcast home loads first lanes without a black page.
- Podcast category page shows 40 and loads the next 40 on scroll.
- Podcast search stays responsive and loads the next 40 on scroll.
- Main search order remains Songs, Artists, Albums, Playlists, Videos, Podcasts, Radio Stations.
- Mature content is hidden by default.
- Mature sections appear only after setting ON and consent confirmed.
- No heavy phone heat, fetch loops, or repeated render bursts during normal browsing.
