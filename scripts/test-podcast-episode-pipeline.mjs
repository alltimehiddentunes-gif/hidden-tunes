/**
 * Prove podcast episode loading pipeline for mature shows.
 * Run: node scripts/test-podcast-episode-pipeline.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const BASE = "https://admin.hiddentunes.com";
const apiSource = readFileSync(
  new URL("../services/podcastCatalogApi.ts", import.meta.url),
  "utf8"
);

const episodeByShowSource = apiSource.slice(
  apiSource.indexOf("export async function fetchPodcastEpisodesByShow"),
  apiSource.indexOf("export async function fetchPodcastShowById")
);
assert.match(episodeByShowSource, /mature_enabled:\s*options\?\.includeMature/);
assert.match(episodeByShowSource, /age_confirmed:\s*options\?\.includeMature/);

async function getJson(path) {
  const response = await fetch(`${BASE}${path}`);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

const showsResp = await getJson(
  "/api/podcasts/shows?page=1&limit=3&includeMature=true&mature_enabled=true&age_confirmed=true&category=adult-lifestyle"
);
assert.equal(showsResp.status, 200);
assert.ok(showsResp.json?.shows?.length >= 3);

const samples = showsResp.json.shows.slice(0, 3);
const report = [];

for (const [index, show] of samples.entries()) {
  const id = show.id;
  const sampleLabel = `sample-${index + 1}`;
  const claimed = Number(show.episode_count || 0);

  const broken = await getJson(
    `/api/podcasts/episodes?show_id=${encodeURIComponent(id)}&page=1&limit=40&includeMature=true`
  );
  const fixed = await getJson(
    `/api/podcasts/episodes?show_id=${encodeURIComponent(id)}&page=1&limit=40&includeMature=true&mature_enabled=true&age_confirmed=true`
  );

  assert.equal(broken.status, 200, `${sampleLabel}: broken request status`);
  assert.equal(fixed.status, 200, `${sampleLabel}: fixed request status`);

  const brokenCount = Array.isArray(broken.json?.episodes) ? broken.json.episodes.length : -1;
  const fixedCount = Array.isArray(fixed.json?.episodes) ? fixed.json.episodes.length : -1;
  const fixedTotal = Number(fixed.json?.pagination?.total || 0);
  const matchShow = (fixed.json?.episodes || []).filter((ep) => ep.show_id === id).length;

  assert.equal(
    brokenCount,
    0,
    `${sampleLabel}: includeMature without age confirmation must reproduce empty episodes`
  );
  assert.ok(fixedCount > 0, `${sampleLabel}: gated mature request must return episodes`);
  assert.equal(matchShow, fixedCount, `${sampleLabel}: all episodes must belong to show`);

  report.push({
    sample: sampleLabel,
    claimedEpisodeCount: claimed,
    missingAgeConfirmation: true,
    gatedRequest: true,
    httpBroken: broken.status,
    httpFixed: fixed.status,
    rawBroken: brokenCount,
    rawFixed: fixedCount,
    backendTotalFixed: fixedTotal,
    afterShowIdFilter: matchShow,
  });
}

console.log("PASS podcast episode pipeline", {
  rootCause: "mature episode metadata requires explicit age confirmation",
  samples: report,
});
