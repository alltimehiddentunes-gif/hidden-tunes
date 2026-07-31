/**
 * Prove podcast episode loading pipeline for mature shows.
 * Run: node scripts/test-podcast-episode-pipeline.mjs
 */
import assert from "node:assert/strict";

const BASE = "https://admin.hiddentunes.com";

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
  "/api/podcasts/shows?page=1&limit=3&includeMature=true&category=adult-lifestyle"
);
assert.equal(showsResp.status, 200);
assert.ok(showsResp.json?.shows?.length >= 3);

const samples = showsResp.json.shows.slice(0, 3);
const report = [];

for (const show of samples) {
  const id = show.id;
  const title = show.title;
  const claimed = Number(show.episode_count || 0);

  const broken = await getJson(
    `/api/podcasts/episodes?show_id=${encodeURIComponent(id)}&page=1&limit=40`
  );
  const fixed = await getJson(
    `/api/podcasts/episodes?show_id=${encodeURIComponent(id)}&page=1&limit=40&includeMature=true`
  );

  assert.equal(broken.status, 200, `${title}: broken request status`);
  assert.equal(fixed.status, 200, `${title}: fixed request status`);

  const brokenCount = Array.isArray(broken.json?.episodes) ? broken.json.episodes.length : -1;
  const fixedCount = Array.isArray(fixed.json?.episodes) ? fixed.json.episodes.length : -1;
  const fixedTotal = Number(fixed.json?.pagination?.total || 0);
  const matchShow = (fixed.json?.episodes || []).filter((ep) => ep.show_id === id).length;

  assert.equal(
    brokenCount,
    0,
    `${title}: current client (no includeMature) must reproduce empty episodes`
  );
  assert.ok(fixedCount > 0, `${title}: includeMature=true must return episodes`);
  assert.equal(matchShow, fixedCount, `${title}: all episodes must belong to show`);

  report.push({
    podcastId: id,
    title,
    claimedEpisodeCount: claimed,
    requestBroken: `/api/podcasts/episodes?show_id=${id}&page=1&limit=40`,
    requestFixed: `/api/podcasts/episodes?show_id=${id}&page=1&limit=40&includeMature=true`,
    httpBroken: broken.status,
    httpFixed: fixed.status,
    rawBroken: brokenCount,
    rawFixed: fixedCount,
    backendTotalFixed: fixedTotal,
    afterShowIdFilter: matchShow,
  });
}

console.log("PASS podcast episode pipeline", {
  rootCause: "fetchPodcastEpisodesByShow omitted includeMature=true",
  samples: report,
});
