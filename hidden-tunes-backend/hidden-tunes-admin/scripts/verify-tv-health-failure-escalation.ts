/**
 * Permanent verifier: soft-failure health escalation.
 *   npm run verify:tv-health-failure-escalation
 */
import assert from "node:assert/strict";
import {
  TV_SOFT_FAILURE_HIDE_THRESHOLD,
  applyTvHealthProbe,
  classifyTvHealthFailureKind,
} from "@/lib/tvStationHealth";

const verified = {
  id: "v1",
  source_type: "hls_stream",
  source_id: "v1",
  source_url: "https://example.com/live.m3u8",
  embed_url: null,
  title: "Verified",
  status: "approved",
  playback_status: "playable",
  is_active: true,
  reliability_score: 85,
  consecutive_failures: 0,
  ios_playable: true,
  android_playable: true,
  stream_is_https: true,
  stream_protocol: "https",
};

function soft(reason = "timeout") {
  return { playable: false as const, playback_status: "failed", reason };
}

async function main() {
  assert.equal(classifyTvHealthFailureKind(soft("DNS failure")), "soft");
  assert.equal(classifyTvHealthFailureKind(soft("http_429")), "soft");
  assert.equal(classifyTvHealthFailureKind(soft("http_503")), "soft");

  const first = applyTvHealthProbe(verified, soft());
  assert.equal(first.quarantined_at, null);
  assert.equal(first.playback_status, "playable");
  assert.equal(first.consecutive_failures, 1);

  const second = applyTvHealthProbe(
    { ...verified, consecutive_failures: 1 },
    soft("connection reset")
  );
  assert.equal(second.quarantined_at, null);
  assert.equal(second.consecutive_failures, 2);

  const third = applyTvHealthProbe(
    { ...verified, consecutive_failures: 2 },
    soft("soft_skip:http_504")
  );
  assert.equal(third.quarantined_at, null);
  assert.equal(third.consecutive_failures, 3);

  const sameRun = applyTvHealthProbe(
    { ...verified, consecutive_failures: 3 },
    soft("timeout"),
    new Date().toISOString(),
    { independentFailureIncrement: 0 }
  );
  assert.equal(sameRun.consecutive_failures, 3);
  assert.equal(sameRun.quarantined_at, null);

  const fourth = applyTvHealthProbe(
    { ...verified, consecutive_failures: TV_SOFT_FAILURE_HIDE_THRESHOLD - 1 },
    soft("aborted")
  );
  assert.ok(fourth.quarantined_at);
  assert.equal(fourth.playback_status, "failed");

  const reset = applyTvHealthProbe(
    { ...verified, consecutive_failures: 3 },
    {
      playable: true,
      playback_status: "playable",
      reason: "ok",
      ios_playable: true,
      android_playable: true,
      stream_is_https: true,
    }
  );
  assert.equal(reset.consecutive_failures, 0);
  assert.equal(reset.quarantined_at, null);

  const legal = applyTvHealthProbe(verified, {
    playable: false,
    playback_status: "blocked",
    reason: "legal copyright block",
  });
  assert.ok(legal.quarantined_at);

  const never = applyTvHealthProbe(
    { ...verified, playback_status: "unchecked", reliability_score: 40 },
    soft()
  );
  assert.notEqual(never.playback_status, "playable");
  assert.ok(never.quarantined_at);

  console.log(
    JSON.stringify(
      {
        ok: true,
        proofs: [
          "first_soft_no_quarantine",
          "second_soft_no_quarantine",
          "same_run_retry_not_independent",
          "threshold_hides",
          "success_resets",
          "legal_immediate",
          "never_verified_not_public_on_fail",
        ],
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
