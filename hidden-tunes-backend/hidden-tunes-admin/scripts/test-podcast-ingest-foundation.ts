import assert from "node:assert/strict";

import {
  isPodcastEpisodePubliclyVisible,
  isPodcastShowPubliclyVisible,
  validatePodcastFeedUrl,
} from "../lib/podcastAdminCatalog";
import {
  applyPublicShowFilters,
  PODCAST_PUBLIC_EPISODE_LIST_SELECT,
  PODCAST_PUBLIC_SHOW_SELECT,
} from "../lib/podcastCatalog";
import { parsePodcastFeedXml } from "../lib/podcastRssIngest";

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Hidden Tunes Test Show</title>
    <description>A real RSS feed fixture.</description>
    <language>en-us</language>
    <itunes:author>Test Host</itunes:author>
    <item>
      <title>Episode One</title>
      <description>First episode.</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="12345" />
      <itunes:duration>1800</itunes:duration>
    </item>
  </channel>
</rss>`;

assert.equal(
  validatePodcastFeedUrl("https://feeds.example.com/podcast.rss"),
  "https://feeds.example.com/podcast.rss"
);
assert.equal(validatePodcastFeedUrl("file:///tmp/feed.xml"), null);
assert.equal(validatePodcastFeedUrl("http://localhost/feed.xml"), null);

const parsed = parsePodcastFeedXml(sampleRss);
assert.equal(parsed.title, "Hidden Tunes Test Show");
assert.equal(parsed.episodes.length, 1);
assert.equal(parsed.episodes[0]?.audio_url, "https://cdn.example.com/ep1.mp3");

assert.equal(
  isPodcastShowPubliclyVisible({
    status: "pending",
    is_active: false,
    feed_status: "unchecked",
  }),
  false
);

assert.equal(
  isPodcastShowPubliclyVisible({
    status: "approved",
    is_active: true,
    feed_status: "active",
  }),
  true
);

assert.equal(
  isPodcastEpisodePubliclyVisible({
    status: "pending",
    is_active: false,
    playback_status: "unchecked",
  }),
  false
);

assert.ok(PODCAST_PUBLIC_SHOW_SELECT.includes("title"));
assert.ok(!PODCAST_PUBLIC_SHOW_SELECT.includes("feed_url"));
assert.ok(!PODCAST_PUBLIC_EPISODE_LIST_SELECT.includes("audio_url"));

const publicQuery = applyPublicShowFilters(
  {
    eq(field: string, value: unknown) {
      assert.equal(field, "status");
      assert.equal(value, "approved");
      return {
        eq(nextField: string, nextValue: unknown) {
          assert.equal(nextField, "is_active");
          assert.equal(nextValue, true);
          return {
            eq(finalField: string, finalValue: unknown) {
              assert.equal(finalField, "feed_status");
              assert.equal(finalValue, "active");
              return "filtered";
            },
          };
        },
      };
    },
  },
  {}
);

assert.equal(publicQuery, "filtered");

console.log("podcast ingest foundation route tests passed");
