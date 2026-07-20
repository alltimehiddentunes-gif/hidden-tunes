/**
 * Focused unit tests for global playback handoff arbitration.
 * Run: npx --yes tsx scripts/test-playback-handoff.ts
 */

import {
  __getPlaybackHandoffDebugState,
  __resetPlaybackHandoffForTests,
  claimExclusivePlayback,
  isPlaybackHandoffAbortError,
  isPlaybackOwnerActive,
  registerPlaybackOwnerAdapter,
  requestPlayback,
  type PlaybackOwnerId,
} from "../services/playback/PlaybackHandoffCoordinator";

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

type StopLog = { owner: PlaybackOwnerId; reason: string };

async function main() {
  __resetPlaybackHandoffForTests();

  const stops: StopLog[] = [];
  const starts: string[] = [];

  const register = (id: PlaybackOwnerId) =>
    registerPlaybackOwnerAdapter({
      id,
      stopImmediately: (reason) => {
        stops.push({ owner: id, reason });
      },
      isActive: () => isPlaybackOwnerActive(id),
    });

  register("shared-audio");
  register("tv");
  register("video");
  register("sports");

  // 1. TV → song
  stops.length = 0;
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-a",
  });
  assert(isPlaybackOwnerActive("tv"), "1a. TV active");
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "music",
    mediaKey: "song-1",
  });
  assert(isPlaybackOwnerActive("shared-audio"), "1b. song active");
  assert(
    stops.some((entry) => entry.owner === "tv"),
    "1c. TV stop called before song ownership"
  );

  // 2. Song → TV
  stops.length = 0;
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-b",
  });
  assert(isPlaybackOwnerActive("tv"), "2a. TV active");
  assert(
    stops.some((entry) => entry.owner === "shared-audio"),
    "2b. audio stop called before TV ownership"
  );

  // 3. Radio → podcast (same shared-audio owner replacement)
  stops.length = 0;
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "radio",
    mediaKey: "radio-1",
  });
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "podcast",
    mediaKey: "pod-1",
  });
  assert(isPlaybackOwnerActive("shared-audio"), "3a. shared-audio still owner");
  assertEqual(
    __getPlaybackHandoffDebugState().mediaKey,
    "pod-1",
    "3b. podcast media key wins"
  );
  assert(
    !stops.some((entry) => entry.owner === "shared-audio"),
    "3c. same-owner does not stop itself"
  );

  // 4. Rapid three taps — only last start runs
  starts.length = 0;
  stops.length = 0;

  const deferred = () => {
    let resolveFn: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    return { promise, resolve: () => resolveFn() };
  };

  const tvGate = deferred();
  const radioGate = deferred();

  const tvPromise = requestPlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-late",
    start: async ({ isCurrent }) => {
      await tvGate.promise;
      if (!isCurrent()) return;
      starts.push("tv");
    },
  });

  const radioPromise = requestPlayback({
    owner: "shared-audio",
    contentKind: "radio",
    mediaKey: "radio-late",
    start: async ({ isCurrent }) => {
      await radioGate.promise;
      if (!isCurrent()) return;
      starts.push("radio");
    },
  });

  const songPromise = requestPlayback({
    owner: "shared-audio",
    contentKind: "music",
    mediaKey: "song-late",
    start: async ({ isCurrent }) => {
      if (!isCurrent()) return;
      starts.push("song");
    },
  });

  // Finish older resolvers out of order after song already claimed.
  tvGate.resolve();
  radioGate.resolve();
  await Promise.all([tvPromise, radioPromise, songPromise]);
  assertEqual(starts.join(","), "song", "4. only Song C starts");
  assert(isPlaybackOwnerActive("shared-audio"), "4b. song owner active");

  // 5. Stale TV resolver ignored
  starts.length = 0;
  const staleGate = deferred();
  const staleTv = requestPlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-stale",
    start: async ({ isCurrent }) => {
      await staleGate.promise;
      if (!isCurrent()) return;
      starts.push("stale-tv");
    },
  });
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "podcast",
    mediaKey: "pod-wins",
  });
  staleGate.resolve();
  await staleTv;
  assertEqual(starts.length, 0, "5. stale TV result ignored");
  assert(isPlaybackOwnerActive("shared-audio"), "5b. podcast remains active");

  // 6. Stale audio auto-next guard (ownership check API)
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-owns",
  });
  assert(!isPlaybackOwnerActive("shared-audio"), "6. auto-next must not run");

  // 7. PiP transfer — TV stop requested when podcast claims
  stops.length = 0;
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-pip",
  });
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "podcast",
    mediaKey: "pod-pip",
  });
  assert(
    stops.some((entry) => entry.owner === "tv"),
    "7. TV stop requested on podcast claim"
  );

  // 8. Failed new media — old does not restart
  stops.length = 0;
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-before-fail",
  });
  try {
    await requestPlayback({
      owner: "shared-audio",
      contentKind: "radio",
      mediaKey: "bad-radio",
      start: async () => {
        throw new Error("stream unavailable");
      },
    });
    throw new Error("FAIL: 8. expected throw");
  } catch (error) {
    assertEqual(
      String((error as Error).message),
      "stream unavailable",
      "8a. real error surfaces"
    );
  }
  assert(isPlaybackOwnerActive("shared-audio"), "8b. radio still owns after failure");
  assert(!isPlaybackOwnerActive("tv"), "8c. TV does not restart");

  // 9. Aborted request — silent
  let abortedThrew = false;
  await requestPlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-abort",
    start: async ({ signal }) => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      // Simulate abort after supersede
      await claimExclusivePlayback({
        owner: "shared-audio",
        contentKind: "music",
        mediaKey: "song-abort",
      });
      if (signal.aborted || isPlaybackHandoffAbortError(err)) {
        return;
      }
      abortedThrew = true;
      throw err;
    },
  });
  assert(!abortedThrew, "9. aborted request stays silent");

  // 10. Same-owner replacement podcast → audiobook
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "podcast",
    mediaKey: "pod-a",
  });
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "audiobook",
    mediaKey: "book-b",
  });
  assertEqual(
    __getPlaybackHandoffDebugState().contentKind,
    "audiobook",
    "10. audiobook replaces podcast on shared-audio"
  );

  console.log("PASS: playback handoff coordinator tests");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
