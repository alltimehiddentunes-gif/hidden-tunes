/**
 * Sports Phase 1 foundation tests — pure domain logic (no DB required).
 * Run: npx tsx scripts/test-sports-foundation.ts
 */

import assert from "node:assert/strict";

import { evaluateSportsRights, selectPreferredPlaybackMode } from "../lib/sports/rights/evaluate";
import { evaluateSportsTerritory } from "../lib/sports/territory/evaluate";
import {
  canAutoRestoreQuarantine,
  canTransitionStreamStatus,
  shouldQuarantine,
} from "../lib/sports/quarantine/engine";
import {
  verifyEventWindow,
  verifyOfficialSource,
  verifyTechnicalSafety,
} from "../lib/sports/verification/engine";
import { resolveSportsBroadcastPlayback } from "../lib/sports/playback/resolver";
import { redactSecrets } from "../lib/sports/http";
import { SPORTS_FEATURE_FLAG_DEFAULTS } from "../lib/sports/constants";
import { listSportsWorkerKeys, runSportsWorker } from "../lib/sports/workers";
import type { SportsBroadcastRow, SportsRightsGrant, SportsStreamSource } from "../lib/sports/types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const baseGrant = (over: Partial<SportsRightsGrant> = {}): SportsRightsGrant => ({
  id: "g1",
  evidence_status: "approved",
  valid_from: new Date(Date.now() - 86400000).toISOString(),
  valid_until: new Date(Date.now() + 86400000).toISOString(),
  commercial_use_allowed: true,
  aggregation_allowed: true,
  embedding_allowed: true,
  native_playback_allowed: true,
  external_linking_allowed: true,
  mobile_allowed: true,
  desktop_allowed: true,
  web_allowed: true,
  smart_tv_allowed: true,
  ...over,
});

const baseBroadcast = (over: Partial<SportsBroadcastRow> = {}): SportsBroadcastRow => ({
  id: "b1",
  fixture_id: null,
  channel_id: null,
  provider_id: null,
  broadcast_type: "live_match",
  title: "Test Match",
  description: null,
  starts_at: new Date(Date.now() - 60000).toISOString(),
  ends_at: new Date(Date.now() + 3600000).toISOString(),
  availability_status: "live",
  access_type: "free",
  registration_required: false,
  subscription_required: false,
  rights_grant_id: "g1",
  territory_mode: "allowlist",
  official_status: "official",
  verification_status: "verified",
  last_verified_at: new Date().toISOString(),
  published_at: new Date().toISOString(),
  unpublished_at: null,
  quarantined_at: null,
  metadata: {},
  ...over,
});

const baseSource = (over: Partial<SportsStreamSource> = {}): SportsStreamSource => ({
  id: "s1",
  broadcast_id: "b1",
  channel_id: null,
  provider_id: null,
  source_type: "hls",
  source_url_encrypted: "[encrypted]",
  resolver_reference: "ref-1",
  external_deep_link: "https://example.test/watch",
  web_fallback_url: "https://example.test/watch",
  expires_at: new Date(Date.now() + 600000).toISOString(),
  is_direct_play_allowed: true,
  is_embed_allowed: true,
  is_external_only: false,
  priority: 1,
  status: "verified",
  ...over,
});

test("rights: approved grant allows modes", () => {
  const result = evaluateSportsRights({
    grant: baseGrant(),
    platform: "ios",
  });
  assert.equal(result.ok, true);
  assert.ok(result.allowedModes.includes("native"));
});

test("rights: expired grant blocked", () => {
  const result = evaluateSportsRights({
    grant: baseGrant({
      valid_until: new Date(Date.now() - 1000).toISOString(),
    }),
    platform: "ios",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "RIGHTS_EXPIRED");
});

test("rights: platform not allowed", () => {
  const result = evaluateSportsRights({
    grant: baseGrant({ mobile_allowed: false }),
    platform: "ios",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PLATFORM_NOT_ALLOWED");
});

test("territory: geo blocked", () => {
  const result = evaluateSportsTerritory({
    country: "US",
    rules: [{ country_code: "US", availability: "geo_blocked", access_type: "none" }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "GEO_BLOCKED");
});

test("territory: available", () => {
  const result = evaluateSportsTerritory({
    country: "GB",
    rules: [{ country_code: "GB", availability: "available", access_type: "free" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.allowNative, true);
});

test("territory: worldwide_unproven never claims global", () => {
  const result = evaluateSportsTerritory({
    country: "US",
    rules: [],
    territoryMode: "worldwide_unproven",
  });
  assert.equal(result.ok, false);
});

test("playback mode: external-only source cannot resolve native", () => {
  const mode = selectPreferredPlaybackMode(
    ["native", "embedded", "external"],
    {
      is_direct_play_allowed: true,
      is_embed_allowed: true,
      is_external_only: true,
    },
    { nativeEnabled: true, embeddedEnabled: true, externalEnabled: true }
  );
  assert.equal(mode, "external");
});

test("unauthorized native prevented when flag off", () => {
  const mode = selectPreferredPlaybackMode(
    ["native", "external"],
    {
      is_direct_play_allowed: true,
      is_embed_allowed: false,
      is_external_only: false,
    },
    { nativeEnabled: false, embeddedEnabled: false, externalEnabled: true }
  );
  assert.equal(mode, "external");
});

test("quarantine thresholds", () => {
  const q = shouldQuarantine({
    consecutiveFailures: 5,
    playSuccessRate: 90,
    rightsExpired: false,
    rightsRevoked: false,
    providerDisabled: false,
    manifestIdentityChanged: false,
    ownershipChanged: false,
    removalRequested: false,
    territoryConflict: false,
  });
  assert.equal(q.quarantine, true);
  assert.equal(q.autoRecoverable, true);
});

test("rights revoked never auto-restores", () => {
  const q = shouldQuarantine({
    consecutiveFailures: 0,
    playSuccessRate: 100,
    rightsExpired: false,
    rightsRevoked: true,
    providerDisabled: false,
    manifestIdentityChanged: false,
    ownershipChanged: false,
    removalRequested: false,
    territoryConflict: false,
  });
  assert.equal(q.autoRecoverable, false);
  assert.equal(canAutoRestoreQuarantine({ reason: "rights_revoked", successfulChecks: 10 }), false);
});

test("stream status transitions", () => {
  assert.equal(canTransitionStreamStatus("verified", "quarantined"), true);
  assert.equal(canTransitionStreamStatus("rights_revoked", "verified"), false);
});

test("SSRF protection blocks private hosts", () => {
  const result = verifyTechnicalSafety({
    url: "https://127.0.0.1/stream.m3u8",
    allowedDomains: ["127.0.0.1"],
  });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes("ssrf_private_host_blocked"));
});

test("domain allowlist enforced", () => {
  const result = verifyTechnicalSafety({
    url: "https://evil.example/stream.m3u8",
    allowedDomains: ["official.example"],
  });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes("domain_not_allowlisted"));
});

test("official source verification requires evidence", () => {
  const result = verifyOfficialSource({
    providerIdentityConfirmed: false,
    rightsHolderIdentityConfirmed: true,
    officialDomain: "official.example",
    officialChannelOrAccount: true,
    authorizedDistribution: true,
    commercialUsagePermission: true,
    embeddingPermission: false,
    nativePlaybackPermission: false,
    externalLinkPermission: true,
  });
  assert.equal(result.pass, false);
});

test("event window not started / ended", () => {
  const future = verifyEventWindow({
    startsAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 3600000).toISOString(),
  });
  assert.equal(future.code, "NOT_STARTED");

  const past = verifyEventWindow({
    startsAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    endsAt: new Date(Date.now() - 3600000).toISOString(),
  });
  assert.equal(past.code, "EVENT_ENDED");
});

test("resolver: quarantined stream blocked", () => {
  const outcome = resolveSportsBroadcastPlayback({
    broadcast: baseBroadcast({ quarantined_at: new Date().toISOString() }),
    source: baseSource(),
    grant: baseGrant(),
    territories: [{ country_code: "US", availability: "available", access_type: "free" }],
    request: { platform: "ios", country: "US" },
    providerHealthy: true,
    flags: {
      sportsEnabled: true,
      nativeEnabled: true,
      embeddedEnabled: true,
      externalEnabled: true,
    },
    resolvedManifestUrl: "https://cdn.example/x.m3u8",
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "STREAM_QUARANTINED");
});

test("resolver: expired rights blocked", () => {
  const outcome = resolveSportsBroadcastPlayback({
    broadcast: baseBroadcast(),
    source: baseSource(),
    grant: baseGrant({ valid_until: new Date(Date.now() - 1000).toISOString() }),
    territories: [{ country_code: "US", availability: "available", access_type: "free" }],
    request: { platform: "ios", country: "US" },
    providerHealthy: true,
    flags: {
      sportsEnabled: true,
      nativeEnabled: true,
      embeddedEnabled: true,
      externalEnabled: true,
    },
    resolvedManifestUrl: "https://cdn.example/x.m3u8",
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "RIGHTS_EXPIRED");
});

test("resolver: external-only cannot resolve natively", () => {
  const outcome = resolveSportsBroadcastPlayback({
    broadcast: baseBroadcast(),
    source: baseSource({ is_external_only: true, is_direct_play_allowed: false }),
    grant: baseGrant({ native_playback_allowed: false }),
    territories: [{ country_code: "US", availability: "external_only", access_type: "external" }],
    request: { platform: "ios", country: "US" },
    providerHealthy: true,
    flags: {
      sportsEnabled: true,
      nativeEnabled: true,
      embeddedEnabled: true,
      externalEnabled: true,
    },
    resolvedManifestUrl: "https://cdn.example/x.m3u8",
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.playback.mode, "external");
});

test("resolver: provider failure isolated", () => {
  const outcome = resolveSportsBroadcastPlayback({
    broadcast: baseBroadcast(),
    source: baseSource(),
    grant: baseGrant(),
    territories: [{ country_code: "US", availability: "available", access_type: "free" }],
    request: { platform: "ios", country: "US" },
    providerHealthy: false,
    flags: {
      sportsEnabled: true,
      nativeEnabled: true,
      embeddedEnabled: true,
      externalEnabled: true,
    },
    resolvedManifestUrl: "https://cdn.example/x.m3u8",
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "PROVIDER_UNAVAILABLE");
});

test("secret redaction", () => {
  const redacted = redactSecrets({
    title: "Match",
    source_url_encrypted: "secret",
    token: "abc",
    nested: { manifestUrl: "https://example.com/a.m3u8?sig=1" },
  }) as Record<string, unknown>;
  assert.equal(redacted.source_url_encrypted, "[REDACTED]");
  assert.equal(redacted.token, "[REDACTED]");
});

test("feature flags default public sports off", () => {
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_enabled, false);
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_provider_imports_enabled, false);
});

test("worker skeleton idempotent skip", async () => {
  const report = await runSportsWorker("sports-fixture-sync", { dryRun: true });
  assert.equal(report.status, "skipped");
  assert.ok(listSportsWorkerKeys().length >= 10);
});

test("home section isolation concept: empty sections omitted helper", async () => {
  const { omitEmptyHomeSections } = await import("../lib/sports/catalog");
  const partial = omitEmptyHomeSections({
    liveNow: [{ id: "1", title: "A", status: "live" }],
    startingSoon: [],
    freeToWatch: [],
    football: [],
    basketball: [],
    otherLiveSports: [],
    sportsChannels: [],
    highlights: [],
    replays: [],
    recommended: [],
    continueWatching: [],
  });
  assert.ok(partial.liveNow);
  assert.equal(partial.startingSoon, undefined);
});

console.log(`\n${passed} sports foundation tests passed`);
