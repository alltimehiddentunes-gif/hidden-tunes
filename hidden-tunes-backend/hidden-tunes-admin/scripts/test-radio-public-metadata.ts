import assert from "node:assert/strict";

import { buildRadioSourceUpdatePayload } from "../lib/radioCatalogWorker";
import {
  buildRadioStationFingerprint,
  normalizeRadioBrowserStationForImport,
  normalizeRadioName,
  normalizeRadioTags,
  normalizeRadioUrl,
} from "../lib/radioNormalization";

function main() {
  assert.equal(normalizeRadioName("  HIDDEN--Soul / Radio  "), "hidden soul radio");
  assert.deepEqual(normalizeRadioTags("Jazz, jazz, Radio Browser, News, "), ["jazz", "news"]);
  assert.equal(
    normalizeRadioUrl(" HTTPS://STREAM.EXAMPLE.COM:443/live/?b=2&a=1#frag ", { stream: true }),
    "https://stream.example.com/live?a=1&b=2"
  );
  assert.equal(
    normalizeRadioUrl("https://station.example.com/?utm_source=x&b=2&a=1"),
    "https://station.example.com/?a=1&b=2"
  );

  const normalizedA = normalizeRadioBrowserStationForImport(
    {
      stationuuid: "ABC-123",
      name: " Café Radio ",
      url_resolved: "HTTPS://STREAM.EXAMPLE.COM:443/live/?b=2&a=1#frag",
      homepage: "https://station.example.com/?utm_source=x",
      favicon: "https://station.example.com/logo.png",
      country: "Germany",
      countrycode: "de",
      language: "deu",
      tags: "Jazz, jazz, radio-browser",
      bitrate: 128,
      codec: "mp3",
    },
    "jazz",
    { now: "2026-07-10T00:00:00.000Z", sourceServer: "https://de1.api.radio-browser.info" }
  );
  const normalizedB = normalizeRadioBrowserStationForImport(
    {
      stationuuid: "DIFFERENT-UUID",
      name: "Café Radio",
      url: "https://stream.example.com/live?a=1&b=2",
      homepage: "https://station.example.com/",
      country: "Germany",
      countrycode: "DE",
      language: "German",
      tags: "jazz",
    },
    "jazz",
    { now: "2026-07-10T00:00:00.000Z" }
  );
  const invalid = normalizeRadioBrowserStationForImport(
    { stationuuid: "bad", name: "Bad", url: "not-a-url" },
    "jazz"
  );

  assert.ok(normalizedA);
  assert.ok(normalizedB);
  assert.equal(invalid, null);
  assert.equal(normalizedA.normalized_name, "café radio");
  assert.equal(normalizedA.country_code, "DE");
  assert.equal(normalizedA.language, "german");
  assert.deepEqual(normalizedA.tags, ["jazz"]);
  assert.equal(normalizedA.normalized_stream_url, normalizedB.normalized_stream_url);
  assert.equal(normalizedA.station_fingerprint, normalizedB.station_fingerprint);
  assert.equal(normalizedA.fingerprint_version, 1);

  const fingerprint = buildRadioStationFingerprint({
    normalized_stream_url: normalizedA.normalized_stream_url,
    normalized_name: normalizedA.normalized_name,
    country_code: normalizedA.country_code,
    normalized_homepage_host: normalizedA.normalized_homepage_host,
  });
  assert.equal(fingerprint, normalizedA.station_fingerprint);

  const updatePayload = buildRadioSourceUpdatePayload(normalizedA, {
    id: "existing-station",
    name: "Curated Café Radio",
    metadata_locked: true,
    is_verified: true,
    playback_status: "playable",
    reliability_score: 96,
    health_status: "playable",
    consecutive_failures: 0,
    quarantined_at: "2026-07-09T00:00:00.000Z",
    quarantine_reason: "manual_review",
    is_active: true,
    is_featured: true,
  });
  for (const protectedField of [
    "is_verified",
    "playback_status",
    "reliability_score",
    "health_status",
    "consecutive_failures",
    "quarantined_at",
    "quarantine_reason",
    "is_active",
    "is_featured",
  ]) {
    assert.equal(protectedField in updatePayload, false, `${protectedField} must be preserved`);
  }
  assert.equal("name" in updatePayload, false, "curated display name must be preserved");

  console.log(
    JSON.stringify(
      {
        ok: true,
        normalizedFingerprint: normalizedA.station_fingerprint,
        protectedFieldsPreserved: true,
      },
      null,
      2
    )
  );
}

main();
