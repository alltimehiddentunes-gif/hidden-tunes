import assert from "node:assert/strict";
import {
  createIptvOrgRecoveryProvider,
  createStaticExactRecoveryProvider,
  TvRecoveryProviderRegistry,
} from "../lib/tvRecovery/providerRegistry";
import { planTvStationRecovery, toTvRecoveryDryRunRecord } from "../lib/tvRecovery/engine";
import type { DeepStreamOutcome, DeepStreamProbeResult } from "../lib/tvStreamProtocol";
import type { TvProviderCandidate, TvRecoveryStation } from "../lib/tvRecovery/types";

const NOW = "2026-08-29T12:00:00.000Z";

function station(overrides: Partial<TvRecoveryStation> = {}): TvRecoveryStation {
  return {
    id: "station-1",
    title: "Channel One",
    source_type: "hls_stream",
    source_id: "test-one",
    source_key: "test:one",
    source_url: "https://old.example.com/one.m3u8",
    validated_stream_url: null,
    embed_url: null,
    status: "approved",
    playback_status: "failed",
    is_active: true,
    reliability_score: 40,
    consecutive_failures: 3,
    quarantined_at: NOW,
    disabled_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(overrides: Partial<TvProviderCandidate> = {}): TvProviderCandidate {
  return {
    providerId: "test",
    canonicalId: "one",
    sourceKey: "test:one",
    sourceType: "hls_stream",
    sourceId: "test-one",
    sourceUrl: "https://new.example.com/one.m3u8",
    title: "Channel One",
    ...overrides,
  };
}

function probeResult(url: string, outcome: DeepStreamOutcome): DeepStreamProbeResult {
  const playable = outcome === "playable";
  return {
    ok: true,
    protocol: "hls",
    streamIsHttps: true,
    normalizedUrl: url,
    playable,
    outcome,
    finalUrl: url,
    stableUrl: outcome === "temporary" ? null : url,
    finalUrlIsTemporary: outcome === "temporary",
    contentType: "application/vnd.apple.mpegurl",
    redirectCount: 0,
    manifestValidated: playable || outcome === "drm" || outcome === "temporary",
    mediaValidated: playable || outcome === "temporary",
    keyValidated: playable,
    initSegmentValidated: false,
    drmDetected: outcome === "drm",
    reason: `${outcome}_fixture`,
  };
}

function fixtureRegistry(candidates: TvProviderCandidate[] = [candidate()]) {
  return new TvRecoveryProviderRegistry([
    createStaticExactRecoveryProvider({ id: "test", candidates }),
  ]);
}

function mapProbe(outcomes: Record<string, DeepStreamOutcome>) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    probe: async (url: string) => {
      calls += 1;
      return probeResult(url, outcomes[url] || "dead");
    },
  };
}

async function main() {
  const row = station();
  const refreshProbe = mapProbe({
    "https://old.example.com/one.m3u8": "dead",
    "https://new.example.com/one.m3u8": "playable",
  });
  const refresh = await planTvStationRecovery({
    station: row,
    allStations: [row],
    registry: fixtureRegistry(),
    probe: refreshProbe.probe,
    nowIso: NOW,
  });
  assert.equal(refresh.action, "refresh_source");
  assert.equal(refresh.exactRecoveryReason, "stale_source_replaced_by_exact_provider_identity");
  assert.equal(refresh.patch.source_url, "https://new.example.com/one.m3u8");
  assert.equal(refresh.patch.playback_status, "playable");
  assert.equal(refresh.patch.is_active, undefined, "existing active identity is not rewritten");
  assert.equal(refresh.duplicate.decision, "unique");

  const stillPlayableProbe = mapProbe({
    "https://old.example.com/one.m3u8": "playable",
    "https://new.example.com/one.m3u8": "playable",
  });
  const proactiveRefresh = await planTvStationRecovery({
    station: row,
    allStations: [row],
    registry: fixtureRegistry(),
    probe: stillPlayableProbe.probe,
    nowIso: NOW,
    refreshProvider: true,
  });
  assert.equal(proactiveRefresh.action, "refresh_source");
  assert.equal(
    proactiveRefresh.exactRecoveryReason,
    "current_source_refreshed_from_exact_provider"
  );
  assert.equal(proactiveRefresh.patch.source_url, "https://new.example.com/one.m3u8");

  const refreshedRow = { ...row, ...refresh.patch } as TvRecoveryStation;
  const rerunProbe = mapProbe({ "https://new.example.com/one.m3u8": "playable" });
  const rerun = await planTvStationRecovery({
    station: refreshedRow,
    allStations: [refreshedRow],
    registry: fixtureRegistry(),
    probe: rerunProbe.probe,
    nowIso: "2026-08-29T13:00:00.000Z",
  });
  assert.equal(rerun.action, "none");
  assert.deepEqual(rerun.patch, {}, "idempotent rerun has no station mutation");

  const canonical = station({ id: "canonical", playback_status: "playable", reliability_score: 95 });
  const duplicate = station({
    id: "duplicate",
    is_active: false,
    source_url: "https://duplicate.example.com/one.m3u8",
    created_at: "2026-02-01T00:00:00.000Z",
  });
  const duplicateProbe = mapProbe({});
  const suppressed = await planTvStationRecovery({
    station: duplicate,
    allStations: [canonical, duplicate],
    registry: fixtureRegistry(),
    probe: duplicateProbe.probe,
    nowIso: NOW,
  });
  assert.equal(suppressed.action, "duplicate_suppressed");
  assert.equal(suppressed.duplicate.canonicalStationId, "canonical");
  assert.equal(duplicateProbe.calls, 0, "known duplicate is suppressed before network work");

  const inactive = station({ id: "inactive", is_active: false, playback_status: "failed" });
  const inactiveProbe = mapProbe({
    "https://old.example.com/one.m3u8": "dead",
    "https://new.example.com/one.m3u8": "playable",
  });
  const review = await planTvStationRecovery({
    station: inactive,
    allStations: [inactive],
    registry: fixtureRegistry(),
    probe: inactiveProbe.probe,
    nowIso: NOW,
  });
  assert.equal(review.action, "queue_inactive_review");
  assert.equal(review.activationEligible, true);
  assert.equal(review.proposedState.active, false, "review does not reactivate the row");
  assert.equal(review.patch.is_active, undefined);
  assert.deepEqual(review.reviewChecks, {
    exactIdentity: true,
    duplicateSafe: true,
    canonicalRecord: true,
    providerProvenance: true,
    playbackValidated: true,
    conflict: false,
  });

  const drmProbe = mapProbe({
    "https://old.example.com/one.m3u8": "drm",
    "https://new.example.com/one.m3u8": "drm",
  });
  const drm = await planTvStationRecovery({
    station: row,
    allStations: [row],
    registry: fixtureRegistry(),
    probe: drmProbe.probe,
    nowIso: NOW,
  });
  assert.equal(drm.action, "classify_drm");
  assert.equal(drm.drm, true);
  assert.equal(drm.proposedState.playbackStatus, "blocked");
  assert.notEqual(drm.proposedState.playbackStatus, "playable");

  const temporaryCandidate = candidate({ sourceUrl: "https://new.example.com/one.m3u8?token=short" });
  const temporaryProbe = mapProbe({
    "https://old.example.com/one.m3u8": "dead",
    "https://new.example.com/one.m3u8?token=short": "temporary",
  });
  const temporary = await planTvStationRecovery({
    station: row,
    allStations: [row],
    registry: fixtureRegistry([temporaryCandidate]),
    probe: temporaryProbe.probe,
    nowIso: NOW,
  });
  assert.equal(temporary.action, "classify_temporary");
  assert.equal(temporary.temporary, true);
  assert.equal(temporary.patch.source_url, undefined, "temporary source is never persisted");

  const orphan = station({
    id: "orphan",
    source_key: null,
    source_id: "orphan",
    source_url: "https://dead.example.com/orphan.m3u8",
  });
  const orphanProbe = mapProbe({ "https://dead.example.com/orphan.m3u8": "dead" });
  const preserved = await planTvStationRecovery({
    station: orphan,
    allStations: [orphan],
    registry: fixtureRegistry(),
    probe: orphanProbe.probe,
    nowIso: NOW,
  });
  assert.equal(preserved.action, "preserve_unresolved");
  assert.equal(preserved.exactRecoveryReason, "no_exact_provider_identity_available");
  assert.equal("deleted_at" in preserved.patch, false);
  assert.equal("status" in preserved.patch, false);
  assert.equal(preserved.proposedState.active, true, "dead probe does not assume broadcaster closure");

  const dryRun = toTvRecoveryDryRunRecord(refresh);
  assert.equal("patch" in dryRun, false, "dry-run report does not expose mutation payload/URLs");
  assert.equal(dryRun.currentSource?.host, "old.example.com");
  assert.equal(dryRun.proposedSource?.host, "new.example.com");

  const iptv = createIptvOrgRecoveryProvider({
    loadSnapshot: async () => ({
      channels: [
        { id: "abc", name: "Exact ABC" },
        { id: "abcd", name: "Not ABC" },
      ],
      streams: [
        { channel: "abc", url: "https://iptv.example.com/abc.m3u8" },
        { channel: "abcd", url: "https://iptv.example.com/abcd.m3u8" },
      ],
    }),
  });
  const iptvIdentity = iptv.identify(
    station({ source_key: "iptv-org:abc", source_id: "iptv-org-abc" })
  );
  assert.ok(iptvIdentity);
  const exact = await iptv.resolveExact(iptvIdentity);
  assert.equal(exact.length, 1);
  assert.equal(exact[0].canonicalId, "abc");
  assert.equal(exact[0].title, "Exact ABC");

  console.log("tv provider recovery tests passed");
}

void main();
