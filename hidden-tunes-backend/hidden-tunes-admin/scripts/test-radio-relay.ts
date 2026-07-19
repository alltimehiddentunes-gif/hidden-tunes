/**
 * Targeted tests for radio HTTPS relay signing + SSRF guards.
 * Does not open long-lived live streams.
 */
import assert from "node:assert/strict";

import { resolveRadioPlayStreamUrl } from "../lib/radioRelay/resolvePlayUrl";
import {
  createRadioRelayToken,
  verifyRadioRelayToken,
} from "../lib/radioRelay/tokens";
import { assertRelayUpstreamUrlSafe, isBlockedRelayHostname } from "../lib/radioRelay/ssrf";
import {
  resetRadioRelayLimitsForTests,
  tryAcquireRadioRelaySlot,
} from "../lib/radioRelay/limits";

async function main() {
  process.env.RADIO_STREAM_RELAY_SECRET =
    process.env.RADIO_STREAM_RELAY_SECRET || "test-radio-relay-secret-key";
  process.env.NEXT_PUBLIC_SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "https://admin.hiddentunes.com";

  // SSRF host checks
  assert.equal(isBlockedRelayHostname("localhost"), true);
  assert.equal(isBlockedRelayHostname("127.0.0.1"), true);
  assert.equal(isBlockedRelayHostname("10.0.0.5"), true);
  assert.equal(isBlockedRelayHostname("169.254.169.254"), true);
  assert.equal(isBlockedRelayHostname("192.168.1.10"), true);
  assert.equal(isBlockedRelayHostname("stream.example.com"), false);

  await assert.rejects(() => assertRelayUpstreamUrlSafe("http://127.0.0.1/stream"), /blocked|private/);
  await assert.rejects(() => assertRelayUpstreamUrlSafe("https://example.com/x"), /https_upstream/);
  await assert.rejects(() => assertRelayUpstreamUrlSafe("ftp://example.com/x"), /protocol/);
  const ok = await assertRelayUpstreamUrlSafe("http://example.com/stream.mp3");
  assert.equal(ok.hostname, "example.com");

  // Token sign/verify
  const stationId = "11111111-1111-1111-1111-111111111111";
  const token = createRadioRelayToken(stationId, 60);
  const verified = verifyRadioRelayToken(token, stationId);
  assert.equal(verified.ok, true);

  const expired = createRadioRelayToken(stationId, 1);
  // Force expiry by verifying with mismatched station
  assert.equal(verifyRadioRelayToken(token, "other-id").ok, false);
  assert.equal(verifyRadioRelayToken(expired + "tamper", stationId).ok, false);

  // Expired token
  const oldSecret = process.env.RADIO_STREAM_RELAY_SECRET;
  const { createHmac } = await import("node:crypto");
  // Build manually expired payload
  const payload = Buffer.from(
    JSON.stringify({ sid: stationId, exp: Math.floor(Date.now() / 1000) - 10, n: "abc" })
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const sig = createHmac("sha256", oldSecret!)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  assert.equal(verifyRadioRelayToken(`${payload}.${sig}`, stationId).ok, false);

  // Play resolution
  const https = await resolveRadioPlayStreamUrl({
    stationId,
    streamUrl: "https://cdn.example.com/live.mp3",
  });
  assert.equal(https.kind, "direct_https");
  if (https.kind === "direct_https") {
    assert.equal(https.streamUrl, "https://cdn.example.com/live.mp3");
  }

  const http = await resolveRadioPlayStreamUrl({
    stationId,
    streamUrl: "http://example.com/live.mp3",
  });
  assert.equal(http.kind, "relay_http");
  if (http.kind === "relay_http") {
    assert.match(http.streamUrl, /^https:\/\/admin\.hiddentunes\.com\/api\/radio\/stations\//);
    assert.match(http.streamUrl, /token=/);
    assert.equal(http.upstreamUrl, "http://example.com/live.mp3");
  }

  const privateHttp = await resolveRadioPlayStreamUrl({
    stationId,
    streamUrl: "http://127.0.0.1/secret",
  });
  assert.equal(privateHttp.kind, "unavailable");

  // Concurrency limits
  resetRadioRelayLimitsForTests();
  const slots = [];
  for (let i = 0; i < 8; i += 1) {
    const slot = tryAcquireRadioRelaySlot({
      stationId,
      clientKey: "client-a",
      maxPerStation: 8,
      maxPerClient: 4,
    });
    if (i < 4) assert.ok(slot);
    slots.push(slot);
  }
  // 5th for same client should fail (maxPerClient=4)
  assert.equal(
    tryAcquireRadioRelaySlot({
      stationId,
      clientKey: "client-a",
      maxPerStation: 8,
      maxPerClient: 4,
    }),
    null
  );
  slots.filter(Boolean).forEach((slot) => slot!.release());

  console.log(
    JSON.stringify({
      success: true,
      tests: "radio-relay-security",
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
