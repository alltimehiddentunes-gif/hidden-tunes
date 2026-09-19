import assert from "node:assert/strict";
import { DogmazicAdapter } from "../lib/externalCatalogAcquisition/adapters/dogmazic";
import { evaluateRights } from "../lib/externalCatalogAcquisition/rightsEvaluator";

const licenses = [
  { id: "12", name: "Creative Commons - by 2.0", description: "CC BY", external_link: "http://creativecommons.org/licenses/by/2.0/fr/deed.fr" },
  { id: "27", name: "Creative Commons - by 2.5", description: "CC BY", external_link: "http://www.creativecommons.org/" },
  { id: "36", name: "Creative Commons - by 3.0", description: "CC BY", external_link: "http://creativecommons.org/licenses/by/3.0/" },
  { id: "48", name: "Creative Commons - by 4.0", description: "CC BY", external_link: "https://creativecommons.org/licenses/by/4.0/" },
  { id: "47", name: "Licence Creative Commons 0", description: "CC0", external_link: "https://creativecommons.org/choose/zero/?lang=en" },
  { id: "23", name: "Domaine Public", description: "Public domain", external_link: "" },
  { id: "51", name: "Creative Commons - by-nc 4.0", description: "NC", external_link: "https://creativecommons.org/licenses/by-nc/4.0/" },
];

const song = (id: string, licenseUrl: string) => ({
  id,
  title: `Song ${id}`,
  artist: { id: "artist-1", name: "Fixture Artist" },
  album: { id: "album-1", name: "Fixture Album" },
  composer: "Fixture Composer",
  genre: [{ id: "genre-1", name: "Rock" }],
  time: 180,
  year: 2026,
  format: "mp3",
  bitrate: 320000,
  rate: 44100,
  mime: "audio/mpeg",
  size: 123456,
  art: "https://play.dogmazic.net/image.php?object_id=album-1",
  license: licenseUrl,
  language: "fr",
  filename: "MUST_NOT_LEAK.mp3",
  url: `https://play.dogmazic.net/play/index.php?type=song&oid=${id}&uid=secret`,
});

function mockFetch(): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const parameters = new URLSearchParams(String(init?.body || ""));
    const action = parameters.get("action");
    if (action === "handshake") return Response.json({ auth: "session", session_expire: "2099-01-01T00:00:00Z" });
    if (action === "licenses") return Response.json({ total_count: licenses.length, license: licenses });
    if (action === "license_songs") {
      const license = licenses.find((entry) => entry.id === parameters.get("filter"));
      const limit = Number(parameters.get("limit"));
      const offset = Number(parameters.get("offset"));
      return Response.json({ total_count: 500, song: Array.from({ length: limit }, (_, index) => song(`${license?.id}${offset + index}`, license?.external_link || "")) });
    }
    if (action === "song") {
      const id = String(parameters.get("filter"));
      return Response.json({ ...song(id, licenses[6].external_link) });
    }
    throw new Error(`Unexpected action: ${action}`);
  }) as typeof fetch;
}

const noSleep = async () => {};

async function main() {
  const disabled = new DogmazicAdapter({ apiKey: "fixture", fetchImpl: mockFetch(), sleep: noSleep });
  await assert.rejects(() => disabled.discover({ limit: 1 }), /disabled/);

  const adapter = new DogmazicAdapter({ apiKey: "fixture", enabled: true, fetchImpl: mockFetch(), sleep: noSleep });
  assert.deepEqual(adapter.rateLimitPolicy(), { maxConcurrency: 1, minimumDelayMs: 1100, maxRetries: 3 });
  assert.equal(adapter.providerCapabilities().maxBatchSize, 100);
  const health = await adapter.healthCheck();
  assert.equal(health.reachable, true);

  const page = await adapter.discoverPage({ limit: 12 });
  assert.equal(page.items.length, 12);
  assert.ok(page.nextCursor);
  assert.equal(new Set(page.items.map((item) => item.sourceItemId)).size, 12);
  assert.equal(JSON.stringify(page.items).includes("MUST_NOT_LEAK"), false);
  assert.equal(JSON.stringify(page.items).includes("uid=secret"), false);
  assert.match(page.items[0].sourceUrl, /song\.php\?action=show_song&song_id=/);

  const metadata = await adapter.fetchMetadata(page.items[0].sourceItemId);
  assert.equal(metadata.mediaResolutionRequired, true);
  const evaluation = evaluateRights(await adapter.fetchRights(page.items[0].sourceItemId));
  assert.equal(evaluation.bucket, "AMBER");
  assert.equal(evaluation.nextState, "RIGHTS_REVIEW");
  await assert.rejects(() => adapter.resolveMedia(page.items[0].sourceItemId), /media resolution is disabled/);

  const ncEvaluation = evaluateRights(await adapter.fetchRights("999"));
  assert.equal(ncEvaluation.bucket, "RED");
  assert.equal(ncEvaluation.nextState, "RIGHTS_BLOCKED");

  const resumed = await adapter.discoverPage({ limit: 6, cursor: page.nextCursor });
  assert.equal(resumed.items.length, 6);
  assert.equal(resumed.items.some((item) => page.items.some((previous) => previous.sourceItemId === item.sourceItemId)), false);
  await assert.rejects(() => adapter.discover({ limit: 101 }), /between 1 and 100/);
  await assert.rejects(() => adapter.discover({ limit: 1, cursor: "bad-cursor" }), /Invalid Dogmazic discovery cursor/);
  console.log("external-catalog-dogmazic: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
