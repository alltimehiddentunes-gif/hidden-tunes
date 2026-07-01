import assert from "node:assert/strict";

const baseRow = {
  id: "station-1",
  source_type: "hls_stream",
  source_id: "station-1",
  source_url: "https://stream.example.com/live.m3u8",
  embed_url: null,
  title: "Station One",
  status: "approved",
  playback_status: "playable",
  is_active: true,
  reliability_score: 80,
  consecutive_failures: 0,
};

async function main() {
  const {
    TV_AUTO_DISABLE_THRESHOLD,
    TV_RELIABILITY_THRESHOLD,
    applyTvHealthProbe,
    dedupeTvGrowthCandidates,
    isPublicTvRow,
    validatePublicTvUrl,
  } = await import("../lib/tvStationHealth");

  assert.equal(validatePublicTvUrl("https://stream.example.com/live.m3u8").ok, true);
  assert.equal(validatePublicTvUrl("http://localhost:8080/live.m3u8").ok, false);
  assert.equal(validatePublicTvUrl("http://192.168.1.10/live.m3u8").ok, false);
  assert.equal(validatePublicTvUrl("file:///tmp/live.m3u8").ok, false);

const successUpdate = applyTvHealthProbe(baseRow, {
  playable: true,
  playback_status: "playable",
  reason: "ok",
});
assert.equal(successUpdate.playback_status, "playable");
assert.equal(successUpdate.reliability_score, 86);
assert.equal(successUpdate.consecutive_failures, 0);
assert.equal(successUpdate.is_active, true);
assert.equal(successUpdate.quarantined_at, null);

const failedUpdate = applyTvHealthProbe(
  { ...baseRow, reliability_score: 65, consecutive_failures: 1 },
  {
    playable: false,
    playback_status: "failed",
    reason: "timeout",
  },
  "2026-07-02T00:00:00.000Z"
);
assert.equal(failedUpdate.playback_status, "failed");
assert.equal(failedUpdate.reliability_score, 53);
assert.equal(failedUpdate.consecutive_failures, 2);
assert.equal(failedUpdate.is_active, false);
assert.equal(failedUpdate.quarantined_at, "2026-07-02T00:00:00.000Z");

const disabledUpdate = applyTvHealthProbe(
  { ...baseRow, reliability_score: TV_AUTO_DISABLE_THRESHOLD, consecutive_failures: 3 },
  {
    playable: false,
    playback_status: "failed",
    reason: "still down",
  },
  "2026-07-02T01:00:00.000Z"
);
assert.equal(disabledUpdate.playback_status, "blocked");
assert.ok(disabledUpdate.reliability_score < TV_AUTO_DISABLE_THRESHOLD);
assert.equal(disabledUpdate.disabled_at, "2026-07-02T01:00:00.000Z");

assert.equal(
  isPublicTvRow({
    status: "approved",
    is_active: true,
    playback_status: "playable",
    reliability_score: TV_RELIABILITY_THRESHOLD,
  }),
  true
);
assert.equal(
  isPublicTvRow({
    status: "approved",
    is_active: true,
    playback_status: "playable",
    reliability_score: TV_RELIABILITY_THRESHOLD - 1,
  }),
  false
);

const deduped = dedupeTvGrowthCandidates(
  [
    {
      source_type: "hls_stream",
      source_id: "a",
      source_url: "https://stream.example.com/a.m3u8",
      title: "A",
      country: "US",
    },
    {
      source_type: "hls_stream",
      source_id: "b",
      source_url: "https://stream.example.com/a.m3u8/",
      title: "Different",
      country: "US",
    },
    {
      source_type: "hls_stream",
      source_id: "c",
      source_url: "https://stream.example.com/c.m3u8",
      title: "A",
      country: "US",
    },
  ],
  {
    sourceKeys: new Set(),
    urlKeys: new Set(),
    titleCountryKeys: new Set(),
  }
);
assert.equal(deduped.length, 1);

  console.log("tv station health tests passed");
}

void main();
