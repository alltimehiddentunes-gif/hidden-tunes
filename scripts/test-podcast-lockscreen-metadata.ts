/**
 * Focused Podcast queue metadata contract for HiddenAudio / iOS Now Playing.
 * Run: npx tsx scripts/test-podcast-lockscreen-metadata.ts
 */
import assert from "node:assert/strict";

import type { PodcastEpisode } from "../types/podcast";
import {
  isPodcastAppSong,
  podcastEpisodeToAppSong,
  resolvePodcastArtworkUrl,
} from "../utils/podcastPlaybackAdapter";

const episode: PodcastEpisode = {
  id: "episode-42",
  showId: "show-7",
  showTitle: "The Hidden Show",
  publisher: "Hidden Publisher",
  title: "A Precise Episode Title",
  description: "",
  artworkUrl: "https://cdn.example.com/episode.jpg",
  audioUrl: "https://cdn.example.com/episode.mp3",
  durationSeconds: 1834,
  publishedAt: "2026-07-31T12:00:00Z",
  language: "en",
  categories: ["culture"],
  isExplicit: false,
  matureLevel: "safe",
  source: "podcast_rss",
};

const song = podcastEpisodeToAppSong(episode);

assert.equal(song.title, episode.title, "Now Playing title uses the episode title");
assert.equal(song.artist, episode.showTitle, "artist/subtitle uses the show title");
assert.equal(song.album, episode.showTitle, "album uses the show title");
assert.equal(song.duration, episode.durationSeconds, "duration is retained");
assert.equal(song.artworkUrl, episode.artworkUrl, "episode artwork is retained");
assert.equal(song.contentType, "podcast", "content type is explicit");
assert.equal(song.episodeId, episode.id, "episode identity is retained");
assert.equal(song.podcastId, episode.showId, "Podcast/show identity is retained");
assert.equal(song.showTitle, episode.showTitle, "stable show metadata is retained");
assert.equal(song.publishedAt, episode.publishedAt, "published date is retained");
assert.equal(song.category, "culture", "category is retained");
assert.equal(song.matureScope, "general", "general/mature scope is retained");
assert.equal(song.provider, "podcast_rss", "provider is retained");
assert.ok(isPodcastAppSong(song), "queue row remains identifiable after screen unmount");

assert.equal(
  resolvePodcastArtworkUrl(episode.artworkUrl, "https://cdn.example.com/show.jpg"),
  episode.artworkUrl,
  "episode artwork wins"
);
assert.equal(
  resolvePodcastArtworkUrl("", "https://cdn.example.com/show.jpg"),
  "https://cdn.example.com/show.jpg",
  "show artwork is the deterministic fallback"
);
assert.equal(
  resolvePodcastArtworkUrl("", ""),
  "",
  "empty catalog artwork delegates to the existing global logo fallback"
);

console.log("PASS podcast lock-screen metadata", {
  title: song.title,
  showTitle: song.artist,
  contentType: song.contentType,
  duration: song.duration,
});
