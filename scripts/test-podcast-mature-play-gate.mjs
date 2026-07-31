/**
 * Prove mature podcast play requires dedicated mature play endpoint + age gate query.
 * Run: node scripts/test-podcast-mature-play-gate.mjs
 */
import assert from "node:assert/strict";

const BASE = "https://admin.hiddentunes.com";
const SHOW_ID = "39a6a95d-efce-4cc0-9035-7f96e2f5f0d0";

async function getJson(path) {
  const response = await fetch(`${BASE}${path}`);
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const episodes = await getJson(
  `/api/podcasts/episodes?show_id=${SHOW_ID}&page=1&limit=1&includeMature=true`
);
assert.equal(episodes.status, 200);
assert.ok(episodes.json?.episodes?.length > 0, "need a mature episode");
const episodeId = episodes.json.episodes[0].id;

const general = await getJson(`/api/podcasts/episodes/${episodeId}/play`);
assert.equal(general.status, 403);
assert.match(
  String(general.json?.error || ""),
  /age confirmation/i,
  "general play must reject mature shows"
);

const matureNoGate = await getJson(`/api/podcasts/mature/episodes/${episodeId}/play`);
assert.equal(matureNoGate.status, 403);

const matureGated = await getJson(
  `/api/podcasts/mature/episodes/${episodeId}/play?mature_enabled=true&age_confirmed=true`
);
assert.equal(matureGated.status, 200);
assert.equal(matureGated.json?.success, true);
assert.ok(
  String(matureGated.json?.audio_url || "").startsWith("http"),
  "mature gated play must return audio_url"
);

console.log("PASS podcast mature play gate", {
  episodeId,
  generalStatus: general.status,
  matureGatedStatus: matureGated.status,
  hasAudio: Boolean(matureGated.json?.audio_url),
});
