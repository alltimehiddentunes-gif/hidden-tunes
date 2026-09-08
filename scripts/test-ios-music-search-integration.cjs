/** Actual mobile adapters with isolated transport/policy/native dependencies. No live calls. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const load = Module._load, resolve = Module._resolveFilename;
const ids = [1, 2, 3].map((id) => `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`);
let status = "active", revision = 1, ios = true, sportsVideo = true, responseRevision = 1;
const known = new Set(), denied = new Set(), requests = [], authorizedRefs = [];
const radioCache = new Map();
const policyTarget = { platform: "ios", nativeBuild: "1.0.216", bundleId: "com.hiddentunes.app", profile: "IOS_216" };
const identityHeaders = { "x-ht-platform": "ios", "x-ht-native-build": "1.0.216", "x-ht-bundle-id": "com.hiddentunes.app", "x-ht-policy-profile": "IOS_216" };
const rows = [
  { id: ids[0], title: "Morning One", artist_name: "Echoes", album_title: "Morning Set", genre: "Jazz", mood: "Calm", duration_seconds: 198, artwork_url: "https://images.invalid/cover.png", created_at: "2026-09-01T00:00:00Z" },
  { id: ids[1], title: "Morning Two", artist_name: "Echoes", album_title: "Morning Set", genre: "Jazz", mood: "Calm", duration_seconds: 205 },
  { id: ids[2], title: "Morning Three", artist_name: "Echo", album_title: "Another Set", duration_seconds: 190 },
];
const policy = {
  get IOS_OPERATIONAL_PLATFORM() { return ios; },
  iosOperationalRequestHeaders: () => identityHeaders,
  isIos216PolicyTarget: (value) => JSON.stringify(value) === JSON.stringify(policyTarget),
  refreshIosOperationalPolicy: async () => ({ status: ios ? status : "legacy", revision }),
  getIosOperationalPolicySnapshot: () => ({ status: ios ? status : "legacy", revision }),
  isIosOperationalItemVisible: (ref) => !ios || status === "legacy" || status === "active" && ref && known.has(ref.id) && !denied.has(ref.id),
  iosOperationalSongRef: (song) => song ? { type: "music", id: song.id } : null,
  filterIosOperationalItems: async (items) => { if (!ios || status === "legacy") return items; const allowed = items.filter((row) => !denied.has(row.id)); allowed.forEach((row) => known.add(row.id)); return allowed; },
  resolveIosOperationalPlayback: async (ref) => {
    if (!ios || status === "legacy") return { enforced: false };
    authorizedRefs.push(ref);
    if (denied.has(ref.id)) throw new Error("denied");
    return { enforced: true, playbackUrl: `https://authorized.invalid/${ref.type}/${ref.id}`, revision };
  },
  assertIosOperationalContentAllowed: async (ref) => { if (ios && status !== "legacy" && denied.has(ref.id)) throw new Error("denied"); },
  iosOperationalControlEnabled: (key) => status === "active" && (!key.endsWith("sports-video") || sportsVideo),
};
const noop = () => undefined;
const artwork = { FALLBACK_ARTWORK: "fixture-cover", getArtworkUri: (row) => row.artwork_url || row.artwork || "fixture-cover", isRemoteArtworkUrl: (value) => /^https:\/\//.test(String(value)), normalizeArtworkUrl: (value) => value, pickBestArtworkFromSongs: (songs) => songs[0]?.artwork || "fixture-cover" };
Module._resolveFilename = function (id, parent, ...args) { return resolve.call(this, id.startsWith("@/") ? path.join(root, id.slice(2)) : id, parent, ...args); };
Module._load = function (id, parent, ...args) {
  if (id.endsWith("iosOperationalPolicy")) return policy;
  if (id.endsWith("matureContentSettings")) return { shouldIncludeMatureInApi: () => false };
  if (id.endsWith("catalogJsonFetch")) return { catalogJsonFetch: async (url, init) => { const response = await fetch(url, init); return { response, json: await response.json() }; }, isCatalogAbortError: () => false };
  if (id.endsWith("radioCache")) return { readCachedRadioStations: (key) => radioCache.get(key), writeCachedRadioStations: (key, stations) => radioCache.set(key, stations) };
  if (id.endsWith("radioBrowserApi")) return { RADIO_STATION_PAGE_SIZE: 40, loadRadioCategoryPage: async () => { throw new Error("Unexpected radio category request"); } };
  if (id === "@react-native-async-storage/async-storage") return { getItem: async () => null, multiGet: async () => [], setItem: async () => undefined, multiSet: async () => undefined };
  if (id.endsWith("/artwork")) return artwork;
  if (id.endsWith("/performanceLogs")) return { logApiRefresh: noop, logCacheResult: noop, recordSlowEndpointWarning: noop, startPerformanceTimer: () => noop, logSlowInteraction: noop };
  if (id.endsWith("/backgroundWork")) return { isWithinFirstInteractionWindow: () => false, logBackgroundWork: noop, scheduleDelayedNonEssentialWork: noop };
  if (id.endsWith("/performanceMode")) return { isAppActiveForWork: () => true };
  if (id.endsWith("/startupScheduler")) return { scheduleStartupTask: noop };
  return load.call(this, id, parent, ...args);
};
Module._extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
global.__DEV__ = false;
global.fetch = async (url, init) => {
  requests.push({ url, init });
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/api/ios/")) for (const [key, value] of Object.entries(identityHeaders)) assert.equal(new Headers(init?.headers).get(key), value);
  if (parsed.pathname === "/api/ios/catalog/music") {
    assert.equal(parsed.origin, "https://admin.hiddentunes.com");
    const params = parsed.searchParams;
    let selected = rows.filter((row) => !denied.has(row.id));
    for (const [key, field] of [["artistId", "artist_name"], ["albumId", "album_title"]]) if (params.has(key)) {
      const query = params.get(key).replace(/-/g, " ").toLowerCase();
      selected = selected.filter((row) => row[field].toLowerCase().includes(query));
    }
    const limit = Number(params.get("limit")), offset = Number(params.get("cursor") || 0);
    return new Response(JSON.stringify({ policyTarget, success: true, enforcementEnabled: true, revision, total: selected.length, items: selected.slice(offset, offset + limit), nextCursor: offset + limit < selected.length ? String(offset + limit) : null }), { status: 200 });
  }
  if (parsed.pathname.includes("/sports/")) return new Response(JSON.stringify({ success: true, playback: { mode: "embedded", embedUrl: "https://sports.invalid/watch" }, iosOperational: { policyTarget, enforcementEnabled: true, revision: responseRevision } }), { status: 200 });
  if (parsed.pathname === "/api/radio/stations") return new Response(JSON.stringify({ success: true, stations: [{ id: "radio-safe", name: "Jazz Safe", stream_url: "https://cached.invalid/safe.mp3" }, { id: "radio-denied", name: "Jazz Denied", stream_url: "https://cached.invalid/denied.mp3" }], pagination: { page: 1, limit: 40, total: 80, totalPages: 2, hasMore: true } }), { status: 200 });
  throw new Error(`Unmocked request forbidden: ${url}`);
};

const failures = [];
async function test(name, run) { try { await run(); console.log(`PASS ${name}`); } catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.message}`); } }
async function main() {
  const music = require("../services/hiddenTunesApi.ts");
  const search = require("../services/universalSearchService.ts");
  const sports = require("../services/iosSportsPolicy.ts");
  const songs = await music.getHiddenTunesSongs();
  await test("all-ON music DTO normalization preserves IDs and metadata with canonical media URL", () => {
    assert.equal(songs.length, 3);
    assert.equal(songs[0].id, ids[0]);
    assert.equal(songs[0].artist, "Echoes");
    assert.equal(songs[0].album, "Morning Set");
    assert.equal(songs[0].genre, "Jazz");
    assert.equal(songs[0].mood, "Calm");
    assert.equal(songs[0].duration, 198);
    assert.equal(songs[0].artwork, rows[0].artwork_url);
    assert.equal(songs[0].url, `https://admin.hiddentunes.com/api/ios/media/music/${ids[0]}`);
  });
  await test("derived album route resolves the existing artist-album identifier", async () => {
    const album = await music.getHiddenTunesAlbumById("echoes-morning-set");
    assert.equal(album?.title, "Morning Set");
    assert.equal(album.tracks.length, 2);
  });
  await test("artist detail selects exact existing identity instead of first substring match", async () => {
    assert.equal((await music.getHiddenTunesArtistById("echo"))?.name, "Echo");
  });
  const catalog = { songs, artists: music.extractHiddenTunesArtists(songs), albums: music.extractHiddenTunesAlbums(songs), genres: [], playlists: [], tvVideos: [] };
  const stale = search.runUniversalCatalogSearch(catalog, "Morning");
  denied.add(ids[1]);
  await test("current universal search removes revoked nested artist/album track payloads", () => {
    const current = search.runUniversalCatalogSearch(catalog, "Morning");
    assert.equal(JSON.stringify(current).includes(ids[1]), false);
    assert(current.songs.some((hit) => hit.payload.id === ids[0]));
  });
  await test("merged cached top results use the sanitized current payload", () => {
    const merged = search.mergeGroupedSearchResults(stale);
    assert.equal(JSON.stringify(merged).includes(ids[1]), false);
    assert(merged.hasAnyResults);
  });
  await test("non-iOS search preserves cached results", () => {
    ios = false;
    assert.equal(JSON.stringify(search.runUniversalCatalogSearch(catalog, "Morning")).includes(ids[1]), true);
    ios = true;
  });
  const url = `https://admin.hiddentunes.com/api/sports/fixtures/${ids[0]}/play`;
  const init = { method: "POST", body: JSON.stringify({ platform: "android", country: "US" }), headers: { "Content-Type": "application/json" } };
  await test("fixed iOS Sports route strips caller platform and validates response revision", async () => {
    const response = await sports.fetchIosSportsPlayback(url, init);
    assert(response.ok);
    assert.equal(new URL(requests.at(-1).url).pathname, `/api/ios/sports/play/sports_fixture/${ids[0]}`);
    assert.deepEqual(JSON.parse(requests.at(-1).init.body), { country: "US" });
    responseRevision = 0;
    await assert.rejects(() => sports.fetchIosSportsPlayback(url, init), /changed/);
    responseRevision = revision;
    await assert.rejects(() => sports.fetchIosSportsPlayback("https://other.invalid/api/sports/fixtures/x/play", init), /Invalid/);
  });
  await test("Sports video OFF denies play while retaining metadata", async () => {
    sportsVideo = false;
    await sports.assertIosSportsAvailability(false);
    await assert.rejects(() => sports.fetchIosSportsPlayback(url, init), /unavailable/);
    const filtered = sports.filterIosSportsPayload({ fixtures: [{ id: "fixture", watchability: { playable: true, state: "live", access: "in_app" }, availabilityState: "live_in_app", watchAction: "native" }], videos: [{ id: "video" }], groups: [{ type: "videos", items: [{ id: "video" }] }] });
    assert.equal(filtered.fixtures.length, 1);
    assert.equal(filtered.fixtures[0].watchability.playable, false);
    assert.equal(filtered.fixtures[0].availabilityState, "live_unavailable");
    assert.equal(filtered.fixtures[0].watchAction, "unavailable");
    assert.equal(filtered.videos.length, 0);
    assert.equal(filtered.groups.length, 0);
    sportsVideo = true;
  });
  await test("legacy and non-iOS Sports requests preserve URL and init identity", async () => {
    status = "legacy";
    await sports.fetchIosSportsPlayback(url, init);
    assert.equal(requests.at(-1).url, url);
    assert.equal(requests.at(-1).init, init);
    status = "active"; ios = false;
    await sports.fetchIosSportsPlayback(url, init);
    assert.equal(requests.at(-1).url, url);
    assert.equal(requests.at(-1).init, init);
    ios = true;
  });
  const radio = require("../services/radio/radioCatalogApi.ts");
  const radioNormalizer = require("../services/radio/radioNormalizer.ts");
  const homeLanes = require("../services/radio/radioHomeLanes.ts");
  await test("radio canonical and Radio Browser identities survive normalized list/playback stages", () => {
    const canonical = radio.mapRadioCatalogStationToHiddenTunes({ id: "radio-safe", name: "Jazz Safe" });
    const browser = radioNormalizer.normalizeRadioBrowserStation({ stationuuid: "browser-id", name: "Browser Safe", url_resolved: "https://cached.invalid/browser.mp3" }, "global");
    for (const [station, type] of [[canonical, "radio"], [browser, "radio_browser_station"]]) {
      assert.equal(radioNormalizer.toRadioStationListItem(station).iosPolicyType, type);
      const normalized = radioNormalizer.normalizeRadioStation(station);
      assert.equal(normalized.iosPolicyType, type);
      const song = radioNormalizer.radioStationToAppSong(normalized);
      assert.equal(song.iosPolicyType, type);
      assert.equal(song.id, `radio-${station.id}`);
    }
  });
  await test("radio source filtering preserves backend pagination and cannot reuse cached URL after denial", async () => {
    denied.add("radio-denied");
    const page = await radio.fetchRadioCatalogSearchPage("jazz");
    assert.deepEqual(page.stations.map((row) => row.id), ["radio-safe"]);
    assert.equal(page.hasMore, true);
    assert.equal(page.backendNextOffset, 40);
    assert.equal(page.listTimePlayCalls, 0);
    const station = { ...page.stations[0], iosPolicyType: "radio_browser_station", streamUrl: "https://cached.invalid/stale.mp3" };
    assert.equal(await radio.resolveRadioStationStreamUrl(station), "https://authorized.invalid/radio_browser_station/radio-safe");
    assert.deepEqual(authorizedRefs.at(-1), { type: "radio_browser_station", id: "radio-safe" });
    denied.add("radio-safe");
    await assert.rejects(() => radio.resolveRadioStationStreamUrl(station), /denied/);
    assert.deepEqual(homeLanes.rememberRecommendedLane(page.stations, [], new Set()), []);
    ios = false;
    assert.equal(await radio.resolveRadioStationStreamUrl(station), station.streamUrl);
    assert.equal(homeLanes.rememberRecommendedLane(page.stations, [], new Set()).length, 1);
    ios = true;
  });
  for (const file of ["test-radio-catalog-pagination-parse.ts", "test-radio-uncapped-search.ts", "test-radio-search-no-mature-500.ts"]) {
    await test(`existing offline radio contract ${file}`, () => require(`./${file}`));
  }
  if (failures.length) throw new Error(`${failures.length} integration regression(s): ${failures.map((failure) => failure.name).join("; ")}`);
  console.log("PASS bounded iOS music/search/Sports/radio integration; all requests mocked");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
