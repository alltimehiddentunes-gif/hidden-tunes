import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: "D:\\HiddenTunes\\MediaBridge\\.env" });
if (!process.env.MEDIA_BRIDGE_J2_SECRET && process.env.BRIDGE_AUTH_TOKEN) {
  process.env.MEDIA_BRIDGE_J2_SECRET = process.env.BRIDGE_AUTH_TOKEN;
}
if (!process.env.MEDIA_BRIDGE_BASE_URL) {
  process.env.MEDIA_BRIDGE_BASE_URL = "http://127.0.0.1:8788";
}

const PUBLIC_ORIGIN = "https://api.hiddentunes.com";
const CANARY_QUERY = "testmp3testfile";
const LOCAL_R2_ID = "3c5f5533-e9e8-4715-90dc-be8027d0e480";
const LOCAL_R2_URL =
  "https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev/songs/example.mp3";

function headerDump(headers) {
  return Object.fromEntries([...headers.entries()]);
}

function assertNoInfra(value, extra = "") {
  const text = `${typeof value === "string" ? value : JSON.stringify(value)}\n${extra}`;
  assert.doesNotMatch(
    text,
    /archive\.org\/(download|details)|googlevideo|yt-dlp|MediaBridge|MediaExtractionGateway|bridgeMediaId|8787|8788|extractorKey|YoutubeIE|\/j1\/|\/j2\//i
  );
}

function listen(server, host = "127.0.0.1") {
  return new Promise((resolve) => {
    server.listen(0, host, () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function startSupabaseMock(mode = "empty") {
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Range", mode === "r2" ? "0-0/1" : "*/0");
    if (mode === "r2" && String(req.url || "").includes("/rest/v1/songs")) {
      res.end(
        JSON.stringify([
          {
            id: LOCAL_R2_ID,
            title: "Dance the Long Way Home",
            slug: "dhanc-mira-dance-the-long-way-home-3c5f5533",
            artist: "Dhanc mira",
            artist_name: "Dhanc mira",
            album: "Singles",
            album_title: "Singles",
            genre: "Pop",
            mood: "Velvet After Hours",
            duration: 298,
            duration_seconds: 298,
            audio_url: LOCAL_R2_URL,
            url: LOCAL_R2_URL,
            cover_url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
            artwork_url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000",
            source_type: "r2",
            type: "r2",
            is_public: true,
            created_at: "2026-09-16T21:37:47.524595+00:00",
          },
        ])
      );
      return;
    }
    res.end("[]");
  });
  return server;
}

function waitForOutput(child, pattern, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${pattern}`)), timeoutMs);
    const onData = (buf) => {
      const text = String(buf);
      if (pattern.test(text)) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve(text);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
  });
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode == null) child.kill("SIGKILL");
    }, 2000);
  });
}

async function startBackend(options) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: options.nodeEnv || "test",
      PORT: String(options.port),
      SUPABASE_URL: options.supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: "qualification-service-role-not-production",
      EXTERNAL_DISCOVERY_ENABLED: options.discovery,
      BRIDGE_PLAYBACK_ENABLED: options.playback,
      MEDIA_BRIDGE_BASE_URL: options.bridgeBase,
      MEDIA_BRIDGE_J2_SECRET: options.bridgeSecret,
      PUBLIC_API_BASE_URL: options.publicOrigin,
      J2_TEST_FIXTURE_ENABLED: options.fixture,
      J2_TEST_FIXTURE_KEYS: "archive.org:testmp3testfile",
      J2_SEARCH_TIMEOUT_MS: String(options.searchTimeoutMs || 1200),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {});
  await waitForOutput(child, /running on port/i);
  return child;
}

async function jsonRequest(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
}

function localMediaUrl(localOrigin, streamUrl) {
  const parsed = new URL(streamUrl);
  assert.equal(parsed.origin, PUBLIC_ORIGIN);
  assert.match(parsed.pathname, /^\/api\/media\/[0-9a-f-]{36}$/i);
  return `${localOrigin}${parsed.pathname}`;
}

if (!process.env.MEDIA_BRIDGE_J2_SECRET) {
  console.log("CANARY SKIP: MEDIA_BRIDGE_J2_SECRET / BRIDGE_AUTH_TOKEN not configured.");
  process.exit(0);
}

const configuredBridge = String(process.env.MEDIA_BRIDGE_BASE_URL || "http://127.0.0.1:8788").replace(/\/+$/, "");
const report = {
  FULL_EXPRESS_SONGS_CANARY: "BLOCKED",
  FULL_MEDIA_CANARY: "BLOCKED",
  HEAD: "BLOCKED",
  RANGE_206: "BLOCKED",
  SEEK: "BLOCKED",
  FLAGS_OFF_REGRESSION: "BLOCKED",
  R2_REGRESSION: "BLOCKED",
  FAILURE_ISOLATION: "BLOCKED",
  PUBLIC_INFRASTRUCTURE_LEAK: "UNKNOWN",
};

try {
  const health = await fetch(`${configuredBridge}/health`);
  assert.equal(health.ok, true, "Bridge health");
  assertNoInfra(await health.json());
} catch (err) {
  console.log(`CANARY SKIP: Bridge not reachable (${err.message})`);
  process.exit(0);
}

const emptySupabase = startSupabaseMock("empty");
const r2Supabase = startSupabaseMock("r2");
const emptyPort = await listen(emptySupabase);
const r2Port = await listen(r2Supabase);
const emptyUrl = `http://127.0.0.1:${emptyPort}`;
const r2Url = `http://127.0.0.1:${r2Port}`;

const onPort = 14010;
const offPort = 14011;
const failPort = 14012;
const r2PortBackend = 14013;
let onChild;
let offChild;
let failChild;
let r2Child;

try {
  onChild = await startBackend({
    port: onPort,
    supabaseUrl: emptyUrl,
    discovery: "true",
    playback: "true",
    bridgeBase: configuredBridge,
    bridgeSecret: process.env.MEDIA_BRIDGE_J2_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    fixture: "true",
  });

  const healthOn = await jsonRequest(`http://127.0.0.1:${onPort}/health`);
  assert.equal(healthOn.res.status, 200);
  assert.equal(healthOn.body.status, "ok");

  const search = await jsonRequest(
    `http://127.0.0.1:${onPort}/api/songs?page=1&limit=30&q=${encodeURIComponent(CANARY_QUERY)}`
  );
  assert.equal(search.res.status, 200, "GET /api/songs Express route");
  assert.ok(Array.isArray(search.body), "search returns JSON array");
  assert.ok(search.body.length >= 1, "canary search returned a Hidden Tunes-owned result");
  const hit = search.body.find((row) => String(row.streamUrl || "").startsWith(`${PUBLIC_ORIGIN}/api/media/`));
  assert.ok(hit, "search result uses absolute https://api.hiddentunes.com/api/media URL");
  assert.equal(hit.url, hit.streamUrl);
  assert.equal(hit.audio_url, hit.streamUrl);
  assert.equal(hit.stream_url, hit.streamUrl);
  assert.equal(hit.sourceName || hit.source_name, "Hidden Tunes");
  assert.equal(hit.type || hit.source_type, "r2");
  assertNoInfra(search.body);
  assert.doesNotMatch(JSON.stringify(search.body), /\/api\/songs\/bridge\//);
  report.FULL_EXPRESS_SONGS_CANARY = "PASS";
  report.PUBLIC_INFRASTRUCTURE_LEAK = 0;

  const localOrigin = `http://127.0.0.1:${onPort}`;
  const playbackUrl = localMediaUrl(localOrigin, hit.streamUrl);

  const head = await fetch(playbackUrl, { method: "HEAD" });
  assert.ok(head.status === 200 || head.status === 206, `HEAD status ${head.status}`);
  assert.equal(head.headers.get("location"), null);
  assertNoInfra(headerDump(head.headers));
  report.HEAD = "PASS";

  const first = await fetch(playbackUrl, { headers: { Range: "bytes=0-1023" } });
  assert.equal(first.status, 206);
  assert.ok(first.headers.get("content-range"));
  assert.equal(first.headers.get("location"), null);
  assertNoInfra(headerDump(first.headers));
  const chunk1 = Buffer.from(await first.arrayBuffer());
  assert.ok(chunk1.length > 0 && chunk1.length <= 1024);
  assert.ok(String(first.headers.get("content-type") || "").length > 0);
  report.RANGE_206 = "PASS";

  const seek = await fetch(playbackUrl, { headers: { Range: "bytes=1024-2047" } });
  assert.equal(seek.status, 206);
  const chunk2 = Buffer.from(await seek.arrayBuffer());
  assert.ok(chunk2.length > 0);
  assert.notDeepEqual(
    chunk1.subarray(0, Math.min(16, chunk1.length)),
    chunk2.subarray(0, Math.min(16, chunk2.length))
  );
  report.SEEK = "PASS";
  report.FULL_MEDIA_CANARY = "PASS";

  offChild = await startBackend({
    port: offPort,
    supabaseUrl: emptyUrl,
    discovery: "false",
    playback: "false",
    bridgeBase: configuredBridge,
    bridgeSecret: process.env.MEDIA_BRIDGE_J2_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    fixture: "true",
  });
  const offSearch = await jsonRequest(
    `http://127.0.0.1:${offPort}/api/songs?page=1&limit=30&q=${encodeURIComponent(CANARY_QUERY)}`
  );
  assert.equal(offSearch.res.status, 200);
  assert.ok(Array.isArray(offSearch.body));
  assert.equal(
    offSearch.body.some((row) => String(row.streamUrl || "").includes("/api/media/")),
    false
  );
  const offHealth = await jsonRequest(`http://127.0.0.1:${offPort}/health`);
  assert.equal(offHealth.body.status, "ok");
  report.FLAGS_OFF_REGRESSION = "PASS";

  r2Child = await startBackend({
    port: r2PortBackend,
    supabaseUrl: r2Url,
    discovery: "false",
    playback: "false",
    bridgeBase: configuredBridge,
    bridgeSecret: process.env.MEDIA_BRIDGE_J2_SECRET,
    publicOrigin: PUBLIC_ORIGIN,
    fixture: "false",
  });
  const r2Search = await jsonRequest(`http://127.0.0.1:${r2PortBackend}/api/songs?limit=1`);
  assert.equal(r2Search.res.status, 200);
  assert.equal(r2Search.body[0].id, LOCAL_R2_ID);
  assert.equal(r2Search.body[0].streamUrl || r2Search.body[0].url, LOCAL_R2_URL);
  assert.doesNotMatch(JSON.stringify(r2Search.body), /\/api\/media\//);
  report.R2_REGRESSION = "PASS";

  failChild = await startBackend({
    port: failPort,
    supabaseUrl: emptyUrl,
    discovery: "true",
    playback: "true",
    bridgeBase: "http://127.0.0.1:1",
    bridgeSecret: "wrong-secret-value",
    publicOrigin: PUBLIC_ORIGIN,
    fixture: "true",
    searchTimeoutMs: 200,
  });
  const isolatedHealth = await jsonRequest(`http://127.0.0.1:${failPort}/health`);
  assert.equal(isolatedHealth.body.status, "ok");
  const isolatedSearch = await jsonRequest(
    `http://127.0.0.1:${failPort}/api/songs?page=1&limit=30&q=${encodeURIComponent(CANARY_QUERY)}`
  );
  assert.equal(isolatedSearch.res.status, 200);
  assert.ok(Array.isArray(isolatedSearch.body));
  const isolatedPlay = await jsonRequest(`http://127.0.0.1:${failPort}/api/media/${crypto.randomUUID()}`);
  assert.ok(isolatedPlay.res.status >= 400);
  assert.deepEqual(isolatedPlay.body, { error: "Playback temporarily unavailable" });
  assertNoInfra(isolatedPlay.body);
  report.FAILURE_ISOLATION = "PASS";

  console.log(JSON.stringify({
    CANARY_SEARCH: report.FULL_EXPRESS_SONGS_CANARY,
    CANARY_PLAY: report.FULL_MEDIA_CANARY,
    ...report,
    publicStreamUrl: hit.streamUrl,
    bytes: { first: chunk1.length, seek: chunk2.length },
  }, null, 2));
} finally {
  await stopChild(onChild);
  await stopChild(offChild);
  await stopChild(failChild);
  await stopChild(r2Child);
  await closeServer(emptySupabase);
  await closeServer(r2Supabase);
}
