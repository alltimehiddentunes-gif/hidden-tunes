import assert from "node:assert/strict";

import {
  countPodcastSeedFeedsByCategory,
  listPodcastSeedFeeds,
  PODCAST_SEED_FEEDS,
} from "../lib/podcastSeedFeeds";
import { buildShowCategoryOrFilter } from "../lib/podcastCatalog";
import { parsePodcastFeedXml } from "../lib/podcastRssIngest";

const REQUIRED_CATEGORIES = [
  "health",
  "technology",
  "business",
  "education",
  "science",
  "history",
  "news",
  "comedy",
  "faith",
  "music",
  "society",
  "sports",
] as const;

const counts = countPodcastSeedFeedsByCategory();

for (const category of REQUIRED_CATEGORIES) {
  assert.ok(
    (counts[category] || 0) >= 3,
    `Expected at least 3 seed feeds for ${category}`
  );
}

const seenFeedUrls = new Set<string>();
for (const feed of PODCAST_SEED_FEEDS) {
  assert.ok(feed.title.trim(), "Seed feed title required");
  assert.ok(feed.feedUrl.startsWith("https://"), `HTTPS feed required: ${feed.title}`);
  assert.ok(!seenFeedUrls.has(feed.feedUrl), `Duplicate feed URL: ${feed.feedUrl}`);
  seenFeedUrls.add(feed.feedUrl);
}

for (const slug of ["health", "technology", "business"]) {
  const filter = buildShowCategoryOrFilter(slug);
  assert.ok(filter.includes(`primary_category.eq.${slug}`), slug);
  assert.ok(filter.includes(`categories.cs.{${slug}}`), slug);
}

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample Health Show</title>
    <description>Sample description</description>
    <item>
      <title>Episode One</title>
      <guid isPermaLink="false">sample-guid-1</guid>
      <pubDate>Mon, 01 Jul 2026 09:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

const parsed = parsePodcastFeedXml(sampleRss);
assert.equal(parsed.episodes.length, 1);
assert.equal(parsed.episodes[0]?.guid, "sample-guid-1");

const limited = listPodcastSeedFeeds({ categories: ["health"], limit: 2 });
assert.equal(limited.length, 2);

console.log(
  JSON.stringify(
    {
      success: true,
      total_feeds: PODCAST_SEED_FEEDS.length,
      feeds_by_category: counts,
    },
    null,
    2
  )
);
