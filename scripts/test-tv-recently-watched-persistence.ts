import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import AsyncStorage from "@react-native-async-storage/async-storage";

const root = process.cwd();
const storageKey = "hidden_tunes_tv_recently_watched_v1";
const storage = new Map<string, string>();
let readAttempts = 0;
let writeAttempts = 0;
let failReads = false;
let failWrites = false;

const storageApi = AsyncStorage as unknown as {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

storageApi.getItem = async (key) => {
  readAttempts += 1;
  if (failReads) throw new Error("simulated read failure");
  return storage.get(key) ?? null;
};

storageApi.setItem = async (key, value) => {
  writeAttempts += 1;
  if (failWrites) throw new Error("simulated write failure");
  storage.set(key, value);
};

type RecentlyWatchedModule = typeof import("../services/tv/tvRecentlyWatched");
let sessionNumber = 0;

async function freshSession() {
  sessionNumber += 1;
  const moduleUrl = `${pathToFileURL(
    resolve(root, "services/tv/tvRecentlyWatched.ts")
  ).href}?test-session=${sessionNumber}`;
  return import(moduleUrl) as Promise<RecentlyWatchedModule>;
}

function ids(entries: Awaited<ReturnType<RecentlyWatchedModule["loadTvRecentlyWatched"]>>) {
  return entries.map((entry) => entry.channelId);
}

async function main() {
  const firstSession = await freshSession();
  await firstSession.recordTvRecentlyWatched(" A ");
  assert.equal(writeAttempts, 0, "staging does not write before qualification");
  const firstQualified = await firstSession.confirmTvRecentlyWatched("A");
  assert.deepEqual(ids(firstQualified), ["A"]);
  assert.equal(writeAttempts, 1, "qualification performs exactly one write");

  const firstStored = JSON.parse(storage.get(storageKey) || "[]") as Record<
    string,
    unknown
  >[];
  assert.equal(firstStored.length, 1);
  assert.deepEqual(
    Object.keys(firstStored[0] || {}).sort(),
    ["channelId", "watchedAt"],
    "live history persists only canonical identity and timestamp"
  );

  // A fresh module instance represents a force-killed and relaunched JS process.
  const secondSession = await freshSession();
  const readsBeforeHydration = readAttempts;
  const [hydrated, concurrentHydration] = await Promise.all([
    secondSession.loadTvRecentlyWatched(),
    secondSession.loadTvRecentlyWatched(),
  ]);
  assert.equal(readAttempts - readsBeforeHydration, 1, "hydration coalesces to one read");
  assert.deepEqual(ids(hydrated), ["A"], "qualified history survives process restart");
  assert.deepEqual(ids(concurrentHydration), ["A"]);

  const catalog = new Map([["A", { id: "A", title: "Channel A" }]]);
  assert.deepEqual(
    hydrated.map((entry) => catalog.get(entry.channelId)).filter(Boolean),
    [{ id: "A", title: "Channel A" }],
    "rehydrated identity resolves through the current catalog"
  );
  const storedBeforeOfflineJoin = storage.get(storageKey);
  assert.deepEqual(
    hydrated.map((entry) => new Map().get(entry.channelId)).filter(Boolean),
    [],
    "an unavailable catalog produces no cards"
  );
  assert.equal(
    storage.get(storageKey),
    storedBeforeOfflineJoin,
    "an unavailable catalog never erases persisted history"
  );

  for (const channelId of ["B", "C", "B"]) {
    const writesBeforeQualification = writeAttempts;
    await secondSession.recordTvRecentlyWatched(channelId);
    assert.equal(writeAttempts, writesBeforeQualification, "staging remains write-free");
    await secondSession.confirmTvRecentlyWatched(channelId);
    assert.equal(
      writeAttempts,
      writesBeforeQualification + 1,
      "each qualified update performs one write"
    );
  }
  assert.deepEqual(
    ids(await secondSession.loadTvRecentlyWatched()),
    ["B", "C", "A"],
    "rewatching moves one deduplicated channel to the front"
  );

  for (let index = 0; index < 21; index += 1) {
    const channelId = `station-${index}`;
    await secondSession.recordTvRecentlyWatched(channelId);
    await secondSession.confirmTvRecentlyWatched(channelId);
  }
  const bounded = await secondSession.loadTvRecentlyWatched();
  assert.equal(bounded.length, 20, "history remains bounded to 20 entries");
  assert.equal(bounded[0]?.channelId, "station-20", "history is newest first");
  assert.equal(bounded[19]?.channelId, "station-1", "the oldest entry is evicted");
  assert.ok(
    Buffer.byteLength(storage.get(storageKey) || "", "utf8") < 4096,
    "20 live history entries remain only a few KB"
  );

  const thirdSession = await freshSession();
  const readsBeforeSecondRestart = readAttempts;
  assert.deepEqual(
    ids(await thirdSession.loadTvRecentlyWatched()),
    ids(bounded),
    "the 20-entry order survives another restart"
  );
  assert.equal(readAttempts - readsBeforeSecondRestart, 1);

  const durableBeforeWriteFailure = storage.get(storageKey);
  failWrites = true;
  await thirdSession.recordTvRecentlyWatched("write-failure");
  const memoryAfterWriteFailure = await thirdSession.confirmTvRecentlyWatched(
    "write-failure"
  );
  failWrites = false;
  assert.equal(memoryAfterWriteFailure[0]?.channelId, "write-failure");
  assert.equal(
    storage.get(storageKey),
    durableBeforeWriteFailure,
    "a failed write does not corrupt durable history"
  );

  failReads = true;
  const failedReadSession = await freshSession();
  assert.deepEqual(
    await failedReadSession.loadTvRecentlyWatched(),
    [],
    "a failed read degrades safely to an empty presentation"
  );
  failReads = false;

  const historySource = readFileSync(
    resolve(root, "services/tv/tvRecentlyWatched.ts"),
    "utf8"
  );
  const hostSource = readFileSync(
    resolve(root, "components/tv/TvPlayerHost.tsx"),
    "utf8"
  );
  assert.doesNotMatch(
    historySource,
    /setInterval|requestAnimationFrame/,
    "history adds no loops"
  );
  assert.doesNotMatch(
    hostSource,
    /updateTvWatchProgress/,
    "playback progress performs no writes"
  );

  console.log(
    "PASS: TV Recently Watched persistence, restart, order, bound, and failures"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
