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
  ios_playable: true,
  android_playable: true,
  stream_is_https: true,
  stream_protocol: "https",
};

async function main() {
  const {
    TV_AUTO_DISABLE_THRESHOLD,
    TV_RELIABILITY_THRESHOLD,
    TV_SOFT_FAILURE_HIDE_THRESHOLD,
    applyTvHealthProbe,
    classifyTvHealthFailureKind,
    dedupeTvGrowthCandidates,
    detectTvStreamPayload,
    isPublicTvRow,
    validatePublicTvUrl,
  } = await import("../lib/tvStationHealth");

  assert.equal(validatePublicTvUrl("https://stream.example.com/live.m3u8").ok, true);
  assert.equal(validatePublicTvUrl("http://localhost:8080/live.m3u8").ok, false);
  assert.equal(validatePublicTvUrl("http://192.168.1.10/live.m3u8").ok, false);
  assert.equal(validatePublicTvUrl("file:///tmp/live.m3u8").ok, false);

  assert.equal(classifyTvHealthFailureKind({ reason: "timeout", playback_status: "failed" }), "soft");
  assert.equal(
    classifyTvHealthFailureKind({ reason: "soft_skip:http_504", playback_status: "failed" }),
    "soft"
  );
  assert.equal(
    classifyTvHealthFailureKind({ reason: "http_404", playback_status: "failed" }),
    "hard_technical"
  );
  assert.equal(
    classifyTvHealthFailureKind({ reason: "DRM widevine required", playback_status: "blocked" }),
    "hard_immediate"
  );

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

  // First soft failure: remain visible, no quarantine.
  const soft1 = applyTvHealthProbe(baseRow, {
    playable: false,
    playback_status: "failed",
    reason: "timeout",
  });
  assert.equal(soft1.playback_status, "playable");
  assert.equal(soft1.consecutive_failures, 1);
  assert.equal(soft1.is_active, true);
  assert.equal(soft1.quarantined_at, null);
  assert.equal(soft1.ios_playable, true);

  // Second soft failure: still visible.
  const soft2 = applyTvHealthProbe(
    { ...baseRow, consecutive_failures: 1, reliability_score: soft1.reliability_score },
    { playable: false, playback_status: "failed", reason: "soft_skip:fetch failed" }
  );
  assert.equal(soft2.playback_status, "playable");
  assert.equal(soft2.consecutive_failures, 2);
  assert.equal(soft2.quarantined_at, null);

  // Same-run retry must not count as independent failure.
  const sameRun = applyTvHealthProbe(
    { ...baseRow, consecutive_failures: 2 },
    { playable: false, playback_status: "failed", reason: "timeout" },
    "2026-07-02T00:00:00.000Z",
    { independentFailureIncrement: 0 }
  );
  assert.equal(sameRun.consecutive_failures, 2);
  assert.equal(sameRun.playback_status, "playable");
  assert.equal(sameRun.quarantined_at, null);

  // Escalate to hide only at soft threshold.
  const softHide = applyTvHealthProbe(
    {
      ...baseRow,
      consecutive_failures: TV_SOFT_FAILURE_HIDE_THRESHOLD - 1,
      reliability_score: 70,
    },
    { playable: false, playback_status: "failed", reason: "connection reset" }
  );
  assert.equal(softHide.consecutive_failures, TV_SOFT_FAILURE_HIDE_THRESHOLD);
  assert.equal(softHide.playback_status, "failed");
  assert.equal(softHide.is_active, false);
  assert.ok(softHide.quarantined_at);

  // Success resets streak.
  const restored = applyTvHealthProbe(
    { ...baseRow, consecutive_failures: 3, reliability_score: 70 },
    { playable: true, playback_status: "playable", reason: "ok", ios_playable: true, android_playable: true, stream_is_https: true }
  );
  assert.equal(restored.consecutive_failures, 0);
  assert.equal(restored.playback_status, "playable");
  assert.equal(restored.quarantined_at, null);

  // Hard immediate still quarantines.
  const drm = applyTvHealthProbe(baseRow, {
    playable: false,
    playback_status: "blocked",
    reason: "unsupported DRM widevine",
  });
  assert.ok(drm.quarantined_at);
  assert.equal(drm.is_active, false);

  // Never-verified failed probe must not become public.
  const never = applyTvHealthProbe(
    {
      ...baseRow,
      playback_status: "unchecked",
      consecutive_failures: 0,
      reliability_score: 50,
    },
    { playable: false, playback_status: "failed", reason: "timeout" }
  );
  assert.equal(never.is_active, false);
  assert.ok(never.quarantined_at);
  assert.notEqual(never.playback_status, "playable");

  // First hard technical 404: still visible pending confirmation.
  const hard404a = applyTvHealthProbe(baseRow, {
    playable: false,
    playback_status: "failed",
    reason: "http_404",
  });
  assert.equal(hard404a.playback_status, "playable");
  assert.equal(hard404a.quarantined_at, null);

  // Second hard technical: hide.
  const hard404b = applyTvHealthProbe(
    { ...baseRow, consecutive_failures: 1 },
    { playable: false, playback_status: "failed", reason: "http_404" }
  );
  assert.equal(hard404b.is_active, false);
  assert.ok(hard404b.quarantined_at);

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

  const manifest = detectTvStreamPayload(
    "application/vnd.apple.mpegurl",
    "#EXTM3U\n#EXTINF:10.0,\nsegment.ts"
  );
  assert.equal(manifest.isHlsManifest, true);
  assert.equal(manifest.isVideoLike, true);

  // Keep unused threshold reference for clarity in failure path docs.
  assert.ok(TV_AUTO_DISABLE_THRESHOLD > 0);

  console.log("tv station health tests passed");
}

void main();
