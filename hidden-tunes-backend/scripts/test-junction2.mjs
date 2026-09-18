import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

import { loadJunction2Config, isJunction2SearchActive } from "../services/junction2/config.js";
import { MediaBridgeClient } from "../services/junction2/client.js";
import { isPubliclySurfaceable, isStrictlyEligible } from "../services/junction2/eligibility.js";
import { discoverAndMerge } from "../services/junction2/discover.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "../services/junction2/map.js";
import { PlaybackStore } from "../services/junction2/playbackStore.js";
import { containsPublicLeak, publicPlaybackError, sanitizeStreamHeaders } from "../services/junction2/leak.js";
import { publicApiBaseUrl } from "../services/junction2/publicOrigin.js";
import { createMediaRouter } from "../routes/media.js";

const PUBLIC_BASE = "http://127.0.0.1:4010";
const LOCAL_R2 = {
  id: "3c5f5533-e9e8-4715-90dc-be8027d0e480",
  title: "Dance the Long Way Home",
  slug: "dhanc-mira-dance-the-long-way-home-3c5f5533",
  artist: "Dhanc mira",
  artist_name: "Dhanc mira",
  artistId: "3b7a8cee-98b7-4ffc-b0da-1b06e64a5e3e",
  artist_id: "3b7a8cee-98b7-4ffc-b0da-1b06e64a5e3e",
  album: "Singles",
  album_title: "Singles",
  albumId: "cbdb3974-7652-404c-8210-6459543a349b",
  album_id: "cbdb3974-7652-404c-8210-6459543a349b",
  genre: "Pop",
  mood: "Velvet After Hours",
  duration: 298,
  duration_seconds: 298,
  url: "https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev/songs/example.mp3",
  audio_url: "https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev/songs/example.mp3",
  streamUrl: "https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev/songs/example.mp3",
  stream_url: "https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev/songs/example.mp3",
  artwork: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
  cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
  cover_url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
  thumbnail: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
  sourceName: "Hidden Tunes",
  source_name: "Hidden Tunes",
  type: "r2",
  source_type: "r2",
  isOnline: true,
  is_online: true,
  is_public: true,
  created_at: "2026-09-16T21:37:47.524595+00:00",
  artists: null,
  albums: null,
};

function enabledConfig(overrides = {}) {
  return loadJunction2Config({
    EXTERNAL_DISCOVERY_ENABLED: "true",
    BRIDGE_PLAYBACK_ENABLED: "true",
    MEDIA_BRIDGE_BASE_URL: "http://127.0.0.1:8788",
    MEDIA_BRIDGE_J2_SECRET: "test-secret-value",
    PUBLIC_API_BASE_URL: PUBLIC_BASE,
    J2_TEST_FIXTURE_ENABLED: "false",
    NODE_ENV: "test",
    ...overrides,
  });
}

function archiveHit(overrides = {}) {
  return {
    provider: "archive.org",
    sourceId: "testmp3testfile",
    canonicalSourceKey: "archive.org:testmp3testfile",
    title: "mp3 test file",
    artist: "Internet Archive",
    durationMs: 12_000,
    playbackCapability: true,
    policyState: "REVIEW_REQUIRED",
    rightsState: "UNVERIFIED",
    ...overrides,
  };
}

test("flags off: zero Bridge calls and local results unchanged", async () => {
  const config = loadJunction2Config({
    EXTERNAL_DISCOVERY_ENABLED: "false",
    BRIDGE_PLAYBACK_ENABLED: "false",
    MEDIA_BRIDGE_BASE_URL: "http://127.0.0.1:8788",
    MEDIA_BRIDGE_J2_SECRET: "test-secret-value",
  });
  assert.equal(isJunction2SearchActive(config), false);
  let searches = 0;
  const client = {
    search: async () => {
      searches += 1;
      throw new Error("should not search");
    },
  };
  const local = [LOCAL_R2];
  const merged = await discoverAndMerge(local, { query: "dance", limit: 30, publicBaseUrl: PUBLIC_BASE }, { config, client });
  assert.equal(searches, 0);
  assert.equal(merged, local);
  assert.deepEqual(merged[0], LOCAL_R2);
});

test("missing J2 config fails closed without Bridge calls", async () => {
  const config = loadJunction2Config({
    EXTERNAL_DISCOVERY_ENABLED: "true",
    MEDIA_BRIDGE_BASE_URL: "",
    MEDIA_BRIDGE_J2_SECRET: "",
  });
  let searches = 0;
  const merged = await discoverAndMerge([LOCAL_R2], { query: "x", publicBaseUrl: PUBLIC_BASE }, {
    config,
    client: { search: async () => { searches += 1; return []; } },
  });
  assert.equal(searches, 0);
  assert.equal(merged[0], LOCAL_R2);
});

test("policy fail-closed excludes REVIEW_REQUIRED, UNKNOWN, DENIED", async () => {
  const config = enabledConfig();
  assert.equal(isStrictlyEligible(archiveHit()), false);
  assert.equal(isPubliclySurfaceable(archiveHit({ policyState: "REVIEW_REQUIRED" }), config), false);
  assert.equal(isPubliclySurfaceable(archiveHit({ policyState: "UNKNOWN" }), config), false);
  assert.equal(isPubliclySurfaceable(archiveHit({ policyState: "DENIED", playbackCapability: true }), config), false);
  const client = {
    search: async () => [
      archiveHit(),
      archiveHit({ policyState: "UNKNOWN", canonicalSourceKey: "x:u" }),
      archiveHit({ policyState: "DENIED", canonicalSourceKey: "x:d" }),
    ],
  };
  const merged = await discoverAndMerge([LOCAL_R2], { query: "test", limit: 30, publicBaseUrl: PUBLIC_BASE }, { config, client, store: new PlaybackStore() });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, LOCAL_R2.id);
});

test("local test fixture does not rewrite policy to ELIGIBLE", async () => {
  const config = enabledConfig({ J2_TEST_FIXTURE_ENABLED: "true" });
  const hit = archiveHit();
  assert.equal(hit.policyState, "REVIEW_REQUIRED");
  assert.equal(isStrictlyEligible(hit), false);
  assert.equal(isPubliclySurfaceable(hit, config), true);
  const store = new PlaybackStore();
  const client = { search: async () => [hit] };
  const merged = await discoverAndMerge([], { query: "testmp3testfile", limit: 30, publicBaseUrl: PUBLIC_BASE }, { config, client, store });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source_type, "r2");
  assert.equal(merged[0].sourceName, "Hidden Tunes");
  assert.match(merged[0].streamUrl, /^http:\/\/127\.0\.0\.1:4010\/api\/media\/[0-9a-f-]+$/i);
  assert.equal(containsPublicLeak(merged, PUBLIC_BASE), false);
  const internal = store.get(merged[0].id);
  assert.equal(internal.policyState, "REVIEW_REQUIRED");
  assert.notEqual(internal.policyState, "ELIGIBLE");
});

test("production ignores test fixture allowlist", () => {
  const config = enabledConfig({ NODE_ENV: "production", J2_TEST_FIXTURE_ENABLED: "true" });
  assert.equal(isPubliclySurfaceable(archiveHit(), config), false);
});

test("owner canary is query+source gated and does not rewrite REVIEW_REQUIRED", async () => {
  const config = loadJunction2Config({
    EXTERNAL_DISCOVERY_ENABLED: "false",
    BRIDGE_PLAYBACK_ENABLED: "false",
    MEDIA_BRIDGE_BASE_URL: "http://127.0.0.1:8788",
    MEDIA_BRIDGE_J2_SECRET: "test-secret-value",
    PUBLIC_API_BASE_URL: PUBLIC_BASE,
    NODE_ENV: "production",
    J2_OWNER_CANARY_ENABLED: "true",
    J2_OWNER_CANARY_QUERY: "HT-CANARY-ZOO",
    J2_OWNER_CANARY_UPSTREAM_QUERY: "Me at the zoo",
    J2_OWNER_CANARY_SOURCE_KEYS: "youtube:jnqxac9ivrw",
  });
  const ytHit = {
    provider: "youtube",
    sourceId: "jNQXAC9IVRw",
    canonicalSourceKey: "youtube:jnqxac9ivrw",
    title: "Me at the zoo",
    artist: "jawed",
    durationMs: 19_000,
    playbackCapability: true,
    policyState: "REVIEW_REQUIRED",
    rightsState: "UNVERIFIED",
  };
  const otherHit = { ...ytHit, canonicalSourceKey: "youtube:otherid", sourceId: "otherid", title: "Other" };
  assert.equal(isJunction2SearchActive(config, "dance"), false);
  assert.equal(isJunction2SearchActive(config, "HT-CANARY-ZOO"), true);
  assert.equal(isStrictlyEligible(ytHit), false);
  assert.equal(isPubliclySurfaceable(ytHit, config), true);
  assert.equal(isPubliclySurfaceable(otherHit, config), false);

  let searched = [];
  const store = new PlaybackStore();
  const client = {
    search: async (text) => {
      searched.push(text);
      return [ytHit, otherHit];
    },
  };
  const offPath = await discoverAndMerge([LOCAL_R2], { query: "dance", limit: 30, publicBaseUrl: PUBLIC_BASE }, { config, client, store });
  assert.deepEqual(searched, []);
  assert.equal(offPath[0].id, LOCAL_R2.id);

  const merged = await discoverAndMerge([LOCAL_R2], { query: "HT-CANARY-ZOO", limit: 30, publicBaseUrl: PUBLIC_BASE }, { config, client, store });
  assert.deepEqual(searched, ["Me at the zoo"]);
  assert.equal(merged.length, 2);
  const canarySong = merged.find((row) => row.title === "Me at the zoo");
  assert.ok(canarySong);
  assert.equal(canarySong.sourceName, "Hidden Tunes");
  assert.equal(canarySong.type, "r2");
  assert.match(canarySong.streamUrl, /^http:\/\/127\.0\.0\.1:4010\/api\/media\/[0-9a-f-]+$/i);
  assert.equal(containsPublicLeak(canarySong, PUBLIC_BASE), false);
  assert.doesNotMatch(JSON.stringify(canarySong), /youtube\.com|youtu\.be|googlevideo|yt-dlp/i);
  const internal = store.get(canarySong.id);
  assert.equal(internal.policyState, "REVIEW_REQUIRED");
  assert.notEqual(internal.policyState, "ELIGIBLE");
});

test("owner canary open mode allows generic search without global flags", async () => {
  const config = loadJunction2Config({
    EXTERNAL_DISCOVERY_ENABLED: "false",
    BRIDGE_PLAYBACK_ENABLED: "false",
    MEDIA_BRIDGE_BASE_URL: "http://127.0.0.1:8788",
    MEDIA_BRIDGE_J2_SECRET: "test-secret-value",
    PUBLIC_API_BASE_URL: PUBLIC_BASE,
    NODE_ENV: "production",
    J2_OWNER_CANARY_ENABLED: "true",
    J2_OWNER_CANARY_MODE: "open",
  });
  assert.equal(config.ownerCanaryMode, "open");
  assert.equal(isJunction2SearchActive(config, "Rick Astley"), true);
  assert.equal(isJunction2SearchActive(config, "never gonna give you up"), true);
  assert.equal(isJunction2SearchActive(config, ""), false);

  const ytHit = {
    provider: "youtube",
    sourceId: "dQw4w9WgXcQ",
    canonicalSourceKey: "youtube:dqw4w9wgxcq",
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    durationMs: 213_000,
    playbackCapability: true,
    policyState: "REVIEW_REQUIRED",
    rightsState: "UNVERIFIED",
  };
  assert.equal(isPubliclySurfaceable(ytHit, config), true);

  let searched = [];
  const store = new PlaybackStore();
  const client = {
    search: async (text) => {
      searched.push(text);
      return [ytHit];
    },
  };
  const merged = await discoverAndMerge([LOCAL_R2], { query: "Rick Astley", limit: 5, publicBaseUrl: PUBLIC_BASE }, {
    config,
    client,
    store,
  });
  assert.deepEqual(searched, ["Rick Astley"]);
  assert.equal(merged[0].title, "Never Gonna Give You Up");
  assert.match(merged[0].streamUrl, /^http:\/\/127\.0\.0\.1:4010\/api\/media\//);
  assert.equal(containsPublicLeak(merged[0], PUBLIC_BASE), false);
});

test("owner canary playback is allowed only for allowlisted records while global playback stays off", async () => {
  const config = loadJunction2Config({
    EXTERNAL_DISCOVERY_ENABLED: "false",
    BRIDGE_PLAYBACK_ENABLED: "false",
    MEDIA_BRIDGE_BASE_URL: "http://127.0.0.1:8788",
    MEDIA_BRIDGE_J2_SECRET: "test-secret-value",
    PUBLIC_API_BASE_URL: PUBLIC_BASE,
    NODE_ENV: "production",
    J2_OWNER_CANARY_ENABLED: "true",
    J2_OWNER_CANARY_QUERY: "HT-CANARY-ZOO",
    J2_OWNER_CANARY_SOURCE_KEYS: "youtube:jnqxac9ivrw",
  });
  const store = new PlaybackStore();
  const allowed = store.putFromSearchHit({
    provider: "youtube",
    sourceId: "jNQXAC9IVRw",
    canonicalSourceKey: "youtube:jnqxac9ivrw",
    title: "Me at the zoo",
    artist: "jawed",
    durationMs: 19_000,
    playbackCapability: true,
    policyState: "REVIEW_REQUIRED",
    rightsState: "UNVERIFIED",
    bridgeMediaId: "bmd_zoo",
  });
  const denied = store.putFromSearchHit({
    provider: "youtube",
    sourceId: "other",
    canonicalSourceKey: "youtube:other",
    title: "Other",
    playbackCapability: true,
    policyState: "REVIEW_REQUIRED",
    rightsState: "UNVERIFIED",
    bridgeMediaId: "bmd_other",
  });
  const audio = Buffer.from("ID3canary");
  const client = {
    stream: async (_id, options = {}) => {
      const ranged = Boolean(options.range);
      return {
        status: ranged ? 206 : 200,
        headers: {
          get: (name) => {
            const headers = {
              "content-type": "audio/mpeg",
              "accept-ranges": "bytes",
              "content-range": ranged ? "bytes 0-8/9" : null,
            };
            return headers[String(name).toLowerCase()] ?? null;
          },
        },
        body: {
          getReader() {
            let sent = false;
            return {
              async read() {
                if (sent) return { done: true, value: undefined };
                sent = true;
                return { done: false, value: audio };
              },
            };
          },
        },
      };
    },
  };
  const app = express();
  app.use("/api/media", createMediaRouter({ config, store, client }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const blocked = await fetch(`http://127.0.0.1:${port}/api/media/${denied.publicPlaybackId}`);
  assert.equal(blocked.status, 404);
  const play = await fetch(`http://127.0.0.1:${port}/api/media/${allowed.publicPlaybackId}`, {
    headers: { range: "bytes=0-8" },
  });
  assert.equal(play.status, 206);
  const body = Buffer.from(await play.arrayBuffer());
  assert.ok(body.length > 0);
  await new Promise((resolve) => server.close(resolve));
});

test("eligible Bridge result merges; local duplicate wins; variants do not collapse", async () => {
  const config = enabledConfig();
  const store = new PlaybackStore();
  const eligible = archiveHit({
    policyState: "ELIGIBLE",
    rightsState: "VERIFIED",
    title: "Dance the Long Way Home",
    artist: "Dhanc mira",
  });
  const unique = archiveHit({
    policyState: "ELIGIBLE",
    rightsState: "VERIFIED",
    title: "Other Track",
    artist: "Other Artist",
    canonicalSourceKey: "archive.org:other",
  });
  const liveVariant = archiveHit({
    policyState: "ELIGIBLE",
    rightsState: "VERIFIED",
    title: "Dance the Long Way Home (Live)",
    artist: "Dhanc mira",
    canonicalSourceKey: "archive.org:live",
  });
  const client = { search: async () => [eligible, unique, liveVariant] };
  const merged = await discoverAndMerge([LOCAL_R2], { query: "dance", limit: 30, publicBaseUrl: PUBLIC_BASE }, { config, client, store });
  assert.equal(merged[0], LOCAL_R2);
  assert.equal(merged.some((row) => row.title === "Dance the Long Way Home" && row.id !== LOCAL_R2.id), false);
  assert.equal(merged.some((row) => row.title === "Other Track"), true);
  assert.equal(merged.some((row) => row.title === "Dance the Long Way Home (Live)"), true);
  assert.equal(isConservativeDuplicate({ title: "Song (Remix)", artist: "A" }, { title: "Song", artist: "A" }), false);
});

test("Bridge timeout, 500, and malformed responses preserve local results", async () => {
  const config = enabledConfig();
  const local = [LOCAL_R2];
  const timeoutClient = { search: async () => { const err = new Error("timeout"); err.name = "AbortError"; throw err; } };
  const httpClient = { search: async () => { const err = new Error("bridge_http"); err.code = "BRIDGE_HTTP"; err.status = 500; throw err; } };
  const malformedClient = { search: async () => { const err = new Error("malformed"); err.code = "MALFORMED"; throw err; } };
  assert.deepEqual(await discoverAndMerge(local, { query: "x", publicBaseUrl: PUBLIC_BASE }, { config, client: timeoutClient }), local);
  assert.deepEqual(await discoverAndMerge(local, { query: "x", publicBaseUrl: PUBLIC_BASE }, { config, client: httpClient }), local);
  assert.deepEqual(await discoverAndMerge(local, { query: "x", publicBaseUrl: PUBLIC_BASE }, { config, client: malformedClient }), local);
});

test("empty public base skips overlay so relative /api/media URLs are never emitted", async () => {
  const config = enabledConfig();
  let searches = 0;
  const merged = await discoverAndMerge([], {
    query: "testmp3testfile",
    publicBaseUrl: "",
  }, {
    config,
    client: {
      search: async () => {
        searches += 1;
        return [archiveHit({ policyState: "ELIGIBLE", rightsState: "VERIFIED" })];
      },
    },
  });
  assert.equal(searches, 0);
  assert.deepEqual(merged, []);
});

test("mapped playback URLs use the configured public API origin", () => {
  const record = new PlaybackStore().putFromSearchHit(
    archiveHit({ policyState: "ELIGIBLE", rightsState: "VERIFIED" })
  );
  const origin = "https://api.hiddentunes.com";
  const song = toPublicSong(record, origin);
  const expected = `${origin}/api/media/${record.publicPlaybackId}`;
  assert.equal(song.streamUrl, expected);
  assert.equal(song.url, expected);
  assert.equal(song.audio_url, expected);
  assert.equal(song.stream_url, expected);
  assert.equal(containsPublicLeak(song, origin), false);
});

test("production public origin rejects http and bridge hosts", () => {
  assert.equal(
    publicApiBaseUrl(
      { headers: { host: "api.hiddentunes.com", "x-forwarded-proto": "https" } },
      { production: true, publicApiBaseUrl: "https://api.hiddentunes.com" }
    ),
    "https://api.hiddentunes.com"
  );
  assert.equal(
    publicApiBaseUrl(
      { headers: {} },
      { production: true, publicApiBaseUrl: "http://api.hiddentunes.com" }
    ),
    ""
  );
  assert.equal(
    publicApiBaseUrl(
      { headers: {} },
      {
        production: true,
        publicApiBaseUrl: "https://127.0.0.1:8788",
        baseUrl: "http://127.0.0.1:8788",
      }
    ),
    ""
  );
});

test("public search objects leak neither upstream nor infrastructure", async () => {
  const record = new PlaybackStore().putFromSearchHit(archiveHit({ policyState: "ELIGIBLE", rightsState: "VERIFIED" }));
  const song = toPublicSong(record, PUBLIC_BASE);
  assert.equal(containsPublicLeak(song, PUBLIC_BASE), false);
  assert.equal(song.bridgeMediaId, undefined);
  assert.equal(song.extractor, undefined);
  assert.doesNotMatch(JSON.stringify(song), /archive\.org|yt-dlp|MediaBridge|8788|bridgeMediaId/i);
  assert.equal(containsPublicLeak({ streamUrl: "https://archive.org/download/x/a.mp3" }, PUBLIC_BASE), true);
  assert.equal(containsPublicLeak({ sourceUrl: "https://example.com/a.mp3" }, PUBLIC_BASE), true);
});

test("mergePreferLocal never drops catalog hits", () => {
  const mapped = [{ id: "ext" }];
  assert.equal(mergePreferLocal([LOCAL_R2], mapped, 1)[0], LOCAL_R2);
  assert.equal(mergePreferLocal([LOCAL_R2], mapped, 1).length, 1);
});

test("client search timeout does not hang", async () => {
  const config = enabledConfig({ J2_SEARCH_TIMEOUT_MS: "25" });
  const client = new MediaBridgeClient(config, async (_url, init) => {
    await new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
  await assert.rejects(() => client.search("x"));
});

test("playback flag off rejects safely with Hidden Tunes error", async () => {
  const config = loadJunction2Config({
    BRIDGE_PLAYBACK_ENABLED: "false",
    MEDIA_BRIDGE_BASE_URL: "http://127.0.0.1:8788",
    MEDIA_BRIDGE_J2_SECRET: "test-secret-value",
  });
  const app = express();
  app.use("/api/media", createMediaRouter({ config, store: new PlaybackStore(), client: { stream: async () => { throw new Error("no"); } } }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/media/${crypto.randomUUID()}`);
  const body = await res.json();
  assert.equal(res.status, 404);
  assert.deepEqual(body, publicPlaybackError());
  assert.doesNotMatch(JSON.stringify(body), /bridge|gateway|yt-dlp|archive/i);
  await new Promise((resolve) => server.close(resolve));
});

test("valid bridge playback streams Range/206/HEAD without leaking headers", async () => {
  const config = enabledConfig();
  const store = new PlaybackStore();
  const record = store.putFromSearchHit(archiveHit({ policyState: "ELIGIBLE", rightsState: "VERIFIED", bridgeMediaId: "bmd_test" }));
  const audio = Buffer.alloc(2048, 7);
  let seenRange = null;
  let seenMethod = null;
  const client = {
    stream: async (_id, options) => {
      seenRange = options.range || null;
      seenMethod = options.method;
      const start = options.range ? 1024 : 0;
      const end = options.range ? 2047 : audio.length - 1;
      const slice = audio.subarray(start, end + 1);
      return new Response(options.method === "HEAD" ? null : slice, {
        status: options.range ? 206 : 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(options.method === "HEAD" ? audio.length : slice.length),
          "Content-Range": `bytes ${start}-${end}/${audio.length}`,
          "Accept-Ranges": "bytes",
          Server: "MediaExtractionGateway",
          Location: "https://archive.org/download/x/a.mp3",
          "Set-Cookie": "secret=1",
        },
      });
    },
  };
  const app = express();
  app.use("/api/media", createMediaRouter({ config, store, client }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/media/${record.publicPlaybackId}`;
  try {
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(seenMethod, "HEAD");
    assert.equal(head.headers.get("content-type"), "audio/mpeg");
    assert.equal(head.headers.get("server"), null);
    assert.equal(head.headers.get("location"), null);
    assert.equal(head.headers.get("set-cookie"), null);

    const ranged = await fetch(url, { headers: { Range: "bytes=1024-2047" } });
    assert.equal(ranged.status, 206);
    assert.equal(seenRange, "bytes=1024-2047");
    assert.equal(ranged.headers.get("content-range"), "bytes 1024-2047/2048");
    assert.equal(ranged.headers.get("accept-ranges"), "bytes");
    assert.equal(ranged.headers.get("location"), null);
    const bytes = Buffer.from(await ranged.arrayBuffer());
    assert.equal(bytes.length, 1024);
    assert.deepEqual(bytes, audio.subarray(1024, 2048));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("client abort propagates to Bridge stream", async () => {
  const config = enabledConfig();
  const store = new PlaybackStore();
  const record = store.putFromSearchHit(archiveHit({ policyState: "ELIGIBLE", rightsState: "VERIFIED", bridgeMediaId: "bmd_test" }));
  let aborted = false;
  const client = {
    stream: async (_id, options) => {
      await new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          aborted = true;
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    },
  };
  const app = express();
  app.use("/api/media", createMediaRouter({ config, store, client }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const controller = new AbortController();
  const pending = fetch(`http://127.0.0.1:${port}/api/media/${record.publicPlaybackId}`, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 25));
  controller.abort();
  await assert.rejects(() => pending);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(aborted, true);
  await new Promise((resolve) => server.close(resolve));
});

test("playback timeout/failure is isolated Hidden Tunes error", async () => {
  const config = enabledConfig();
  const store = new PlaybackStore();
  const record = store.putFromSearchHit(archiveHit({ policyState: "ELIGIBLE", rightsState: "VERIFIED", bridgeMediaId: "bmd_test" }));
  const client = { stream: async () => { throw new Error("ECONNREFUSED MediaBridge yt-dlp googlevideo"); } };
  const app = express();
  app.use("/api/media", createMediaRouter({ config, store, client }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/media/${record.publicPlaybackId}`);
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.deepEqual(body, publicPlaybackError());
  assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED|yt-dlp|googlevideo|MediaBridge/i);
  await new Promise((resolve) => server.close(resolve));
});

test("header sanitizer strips infrastructure and Location", () => {
  const headers = sanitizeStreamHeaders({
    "Content-Type": "audio/mpeg",
    Location: "https://archive.org/download/x/a.mp3",
    Server: "gateway",
    "X-Powered-By": "Express",
    "Set-Cookie": "a=b",
    "Content-Range": "bytes 0-1/2",
  });
  assert.deepEqual(headers, {
    "content-type": "audio/mpeg",
    "content-range": "bytes 0-1/2",
  });
});

test("songs route never exposes a public bridge path", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
  const songs = fs.readFileSync(path.join(root, "routes/songs.js"), "utf8");
  const media = fs.readFileSync(path.join(root, "routes/media.js"), "utf8");
  assert.doesNotMatch(songs, /\/api\/songs\/bridge\//);
  assert.match(media, /\/:playbackId/);
});

