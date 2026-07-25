import assert from "node:assert/strict";

import {
  cleanPublicTvDescription,
  isInternalTvDescription,
  sanitizePublicTvDescription,
} from "../lib/tvDescriptionSanitizer";
import { toTvPublicStation } from "../lib/tvCatalog";
import { attachLegalCandidateMeta } from "../lib/tvExpansion25k/sources/types";
import type { TvGrowthCandidate } from "../lib/tvStationHealth";

function expectRejected(input: string, reasonIncludes?: string) {
  const result = sanitizePublicTvDescription(input);
  assert.equal(result.text, null, `expected null for: ${input}`);
  assert.equal(result.rejected, true, `expected rejected for: ${input}`);
  if (reasonIncludes) {
    assert.ok(
      String(result.reason || "").includes(reasonIncludes) ||
        result.reason === reasonIncludes,
      `expected reason ~${reasonIncludes}, got ${result.reason} for: ${input}`
    );
  }
}

function expectKept(input: string) {
  const result = sanitizePublicTvDescription(input);
  assert.equal(result.rejected, false, `unexpected reject: ${result.reason} for: ${input}`);
  assert.equal(result.text, input.trim());
}

function main() {
  // Exact known bad templates
  expectRejected(
    "Czechia _national television stream discovered via Europe deep city search (country-channel-website:_national).",
    "discovered_via"
  );
  expectRejected(
    "RTM+ television stream DISCOVERED VIA Europe deep city search",
    "discovered_via"
  );
  expectRejected(
    "Provider: pluto-tv-global-mjh | Official: https://pluto.tv/live-tv | Station ID: abc | Legal basis: Pluto TV free FAST | Discovered: 2026-07-14T16:10:05.942Z",
    "provider_legal_meta"
  );
  expectRejected(
    "provider: samsung-tv-plus-fast | Legal basis: Samsung TV Plus",
    "provider_legal_meta"
  );
  expectRejected(
    "Africa deep-source candidate (official-youtube-extract).",
    "deep_source_candidate"
  );
  expectRejected(
    "Africa Free-TV master playlist deep-source candidate.",
    "deep_source_candidate"
  );
  expectRejected(
    "Switzerland television stream discovered via public directory verification for Europe expansion.",
    "discovered_via"
  );
  expectRejected(
    "Uganda television stream discovered via iptv-org public directory.",
    "discovered_via"
  );
  expectRejected("country-channel-website:_national", "country_channel_website");
  expectRejected("country_channel_website_foo", "country_channel_website");
  expectRejected("imported from source pack europe-wave");
  expectRejected("imported from europe expansion directory", "imported_from");
  expectRejected("source-pack: europe-deep", "source_pack");
  expectRejected("source pack: europe-deep", "source_pack");
  expectRejected("crawler note: found on internal pack");
  expectRejected("discovery runner: europe-tv-deep-cities", "runner_note");
  expectRejected("runner: europe-tv-deep-cities", "runner_note");
  expectRejected("found during deep search of cities", "deep_search");
  expectRejected("foo_bar_baz", "underscore_slug");
  expectRejected("Komala TV YouTube [_national]");
  expectRejected("Station label [_regional]");
  expectRejected("Station label [_local]");

  // Mixed-case / underscore variants
  expectRejected(
    "Sweden _NATIONAL television stream discovered via EUROPE DEEP CITY SEARCH (country_channel_website)"
  );
  expectRejected(
    "Mali television stream Discovered Via iptv-org public directory."
  );

  // Legitimate descriptions containing national / regional / local
  expectKept(
    "CBC is Canada's national public broadcaster, offering news and culture."
  );
  expectKept(
    "This regional television network covers northern Italy and the Alps."
  );
  expectKept(
    "A local news channel serving the greater Toronto area."
  );
  expectKept(
    "France 24 is an international news channel broadcasting in French and English."
  );
  expectKept(
    "Canal+ Sport emite eventos deportivos en vivo para España."
  );
  expectKept(
    "Ghana-based G-Eye TV / G-EYE Nexus Media live entertainment stream hosted on the broadcaster CDN."
  );
  expectKept("Yobe State television live stream (Nigeria).");
  expectKept(
    "Mature late-night talk programming from licensed entertainment partners."
  );

  // Null / empty
  assert.deepEqual(sanitizePublicTvDescription(null), {
    text: null,
    rejected: false,
    reason: null,
  });
  assert.deepEqual(sanitizePublicTvDescription(""), {
    text: null,
    rejected: false,
    reason: null,
  });
  assert.deepEqual(sanitizePublicTvDescription("   "), {
    text: null,
    rejected: false,
    reason: null,
  });
  assert.equal(cleanPublicTvDescription(null), null);
  assert.equal(isInternalTvDescription("discovered via deep search"), true);
  assert.equal(
    isInternalTvDescription("National weather coverage for Quebec."),
    false
  );

  // Official broadcaster description preserved through API mapper
  const good = toTvPublicStation({
    id: "a",
    title: "Hope Channel",
    description:
      "Hope Channel official international Christian programming stream.",
    thumbnail_url: null,
    region: "US",
    language: "en",
    category: "Religious",
    tags: [],
    reliability_score: 90,
    is_featured: false,
    status: "approved",
    is_active: true,
    playback_status: "playable",
  });
  assert.equal(
    good.description,
    "Hope Channel official international Christian programming stream."
  );

  const bad = toTvPublicStation({
    id: "b",
    title: "RTM+",
    description:
      "Czechia _national television stream discovered via Europe deep city search (country-channel-website:_national).",
    thumbnail_url: null,
    region: "CZ",
    language: null,
    category: "General",
    tags: [],
    reliability_score: 100,
    is_featured: false,
    status: "approved",
    is_active: true,
    playback_status: "playable",
  });
  assert.equal(bad.description, null);

  const metaLeak = toTvPublicStation({
    id: "c",
    title: "Romance 365",
    description:
      "Provider: pluto-tv-global-mjh | Legal basis: Pluto TV | Discovered: 2026-07-14T15:44:30.601Z",
    thumbnail_url: null,
    region: "CA",
    language: "en",
    category: "Entertainment",
    tags: [],
    reliability_score: 100,
    is_featured: false,
    status: "approved",
    is_active: true,
    playback_status: "playable",
  });
  assert.equal(metaLeak.description, null);

  // Importer attachLegalCandidateMeta must not invent public descriptions
  const candidate: TvGrowthCandidate = {
    source_type: "hls_stream",
    source_id: "demo",
    source_url: "https://example.com/live.m3u8",
    title: "Demo TV",
    description: null,
  };
  const attached = attachLegalCandidateMeta(candidate, {
    provider: "pluto-tv-global-mjh",
    officialPage: "https://pluto.tv/live-tv",
    officialStationId: "abc",
    legalBasis: "Pluto TV free FAST",
    discoveredAt: "2026-07-14T16:10:05.942Z",
    country: "CA",
  });
  assert.equal(attached.description, null);
  assert.ok(attached.tags?.some((t) => t.includes("expansion:pluto-tv-global-mjh")));

  const withEditorial = attachLegalCandidateMeta(
    { ...candidate, description: "Official Pluto romance channel." },
    {
      provider: "pluto-tv-global-mjh",
      legalBasis: "Pluto TV free FAST",
      discoveredAt: "2026-07-14T16:10:05.942Z",
    }
  );
  assert.equal(withEditorial.description, "Official Pluto romance channel.");
  assert.equal(
    isInternalTvDescription(withEditorial.description),
    false
  );

  console.log("test-tv-description-sanitizer: ok");
}

main();
