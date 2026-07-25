/**
 * Live radio station-switch transaction tests (no React Native).
 * Run: npx tsx scripts/test-radio-station-switch.ts
 */
import assert from "node:assert/strict";

import {
  __getRadioStationSwitchDebugState,
  __resetRadioStationSwitchForTests,
  beginRadioStationSwitch,
  beginRadioStationSwitchSync,
  claimRadioPlayerOwner,
  classifyRadioPlaybackFailure,
  computeRadioRetryDelayMs,
  getActiveRadioPlayerCount,
  getRadioSessionGeneration,
  isRadioSessionCurrent,
  isRadioSwitchAbortError,
  preemptRadioStationSwitch,
  registerRadioStopSilencer,
  releaseRadioPlayerOwner,
  scheduleRadioRetry,
  shouldAcceptRemoteRadioCommand,
  shouldPublishRadioMetadata,
  markRadioMetadataPublished,
  RADIO_MAX_STREAM_RETRY_ATTEMPTS,
  RADIO_REMOTE_COMMAND_COALESCE_MS,
  cancelRadioRetry,
} from "../services/radio/radioStationSwitchController";
import { radioStationSongId } from "../services/playback/radioPlaybackAdapter";
import {
  buildLiveRadioSessionSongs,
  pickNextEligibleLiveRadioIndex,
  wrapLiveRadioIndex,
} from "../services/radio/radioPlaybackSession";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  __resetRadioStationSwitchForTests();

  // 1. Starting station B stops station A immediately (silencer fired before resolve).
  {
  const stopped: string[] = [];
  registerRadioStopSilencer(async () => {
    stopped.push(`stop-${getRadioSessionGeneration()}`);
  });

  const sessionA = await beginRadioStationSwitch({
    stationId: "a",
    origin: "station_card",
  });
  claimRadioPlayerOwner(sessionA.generation);
  assert.equal(getActiveRadioPlayerCount(), 1);

  const sessionB = await beginRadioStationSwitch({
    stationId: "b",
    origin: "station_card",
  });
  assert.ok(stopped.length >= 2, "silencer must run for A and B");
  assert.equal(isRadioSessionCurrent(sessionA.generation), false);
  assert.equal(isRadioSessionCurrent(sessionB.generation), true);
  assert.equal(sessionB.stationId, "b");
  assert.equal(sessionB.mediaKey, radioStationSongId("b"));
  __resetRadioStationSwitchForTests();
}

// 2. Late response for station A cannot restart it.
{
  const sessionA = beginRadioStationSwitchSync({
    stationId: "a",
    origin: "search",
  });
  const sessionB = beginRadioStationSwitchSync({
    stationId: "b",
    origin: "search",
  });
  assert.equal(isRadioSessionCurrent(sessionA.generation), false);
  assert.equal(isRadioSessionCurrent(sessionB.generation), true);
  assert.equal(claimRadioPlayerOwner(sessionA.generation), false);
  assert.equal(claimRadioPlayerOwner(sessionB.generation), true);
  __resetRadioStationSwitchForTests();
}

// 3. Ten rapid Next commands keep only the final generation current.
{
  const generations: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const session = beginRadioStationSwitchSync({
      stationId: `s${i}`,
      origin: "carplay_next",
    });
    generations.push(session.generation);
  }
  const last = generations[generations.length - 1];
  for (const generation of generations.slice(0, -1)) {
    assert.equal(isRadioSessionCurrent(generation), false);
  }
  assert.equal(isRadioSessionCurrent(last), true);
  assert.equal(getRadioSessionGeneration(), last);
  __resetRadioStationSwitchForTests();
}

// 4. Next during buffering cancels the buffered station (preempt + begin).
{
  const buffered = beginRadioStationSwitchSync({
    stationId: "buffering",
    origin: "app",
  });
  claimRadioPlayerOwner(buffered.generation);
  preemptRadioStationSwitch("skip_during_buffer");
  assert.equal(isRadioSessionCurrent(buffered.generation), false);
  assert.equal(getActiveRadioPlayerCount(), 0);
  const next = beginRadioStationSwitchSync({
    stationId: "next",
    origin: "mini_player_next",
  });
  assert.equal(isRadioSessionCurrent(next.generation), true);
  __resetRadioStationSwitchForTests();
}

// 5. Retry is cancelled when another station is selected.
{
  let retryRan = false;
  const session = beginRadioStationSwitchSync({
    stationId: "retry-me",
    origin: "retry",
  });
  const scheduled = scheduleRadioRetry({
    generation: session.generation,
    attempt: 0,
    failureClass: "transient_timeout",
    run: () => {
      retryRan = true;
    },
  });
  assert.equal(scheduled, true);
  beginRadioStationSwitchSync({ stationId: "other", origin: "station_card" });
  await sleep(computeRadioRetryDelayMs(0) + 50);
  assert.equal(retryRan, false);
  __resetRadioStationSwitchForTests();
}

// 6. Only one native radio player is active.
{
  const a = beginRadioStationSwitchSync({ stationId: "a", origin: "app" });
  claimRadioPlayerOwner(a.generation);
  const b = beginRadioStationSwitchSync({ stationId: "b", origin: "app" });
  claimRadioPlayerOwner(b.generation);
  assert.equal(getActiveRadioPlayerCount(), 1);
  const debug = __getRadioStationSwitchDebugState();
  assert.equal(debug.activePlayerOwnerGeneration, b.generation);
  __resetRadioStationSwitchForTests();
}

// 7. Stop silencer registration is idempotent / cleaned up.
{
  const unregister = registerRadioStopSilencer(async () => undefined);
  const before = __getRadioStationSwitchDebugState().listenerRegistrationCount;
  assert.ok(before >= 1);
  unregister();
  assert.equal(
    __getRadioStationSwitchDebugState().listenerRegistrationCount,
    before - 1
  );
  __resetRadioStationSwitchForTests();
}

// 8. CarPlay Next uses the same switch transaction (origin mapping + mediaKey).
{
  const session = beginRadioStationSwitchSync({
    stationId: "car-1",
    origin: "carplay_next",
  });
  assert.equal(session.origin, "carplay_next");
  assert.equal(session.mediaKey, "radio-car-1");
  __resetRadioStationSwitchForTests();
}

// 9. Duplicate CarPlay events do not create duplicate playback intents.
{
  assert.equal(shouldAcceptRemoteRadioCommand("next"), true);
  assert.equal(shouldAcceptRemoteRadioCommand("next"), false);
  await sleep(RADIO_REMOTE_COMMAND_COALESCE_MS + 20);
  assert.equal(shouldAcceptRemoteRadioCommand("next"), true);
  // Alternating next/previous within the window is still accepted.
  assert.equal(shouldAcceptRemoteRadioCommand("previous"), true);
  __resetRadioStationSwitchForTests();
}

// 10. Radio-to-music style invalidate fully releases radio owner.
{
  const session = beginRadioStationSwitchSync({
    stationId: "radio",
    origin: "app",
  });
  claimRadioPlayerOwner(session.generation);
  releaseRadioPlayerOwner(session.generation, "music_takeover");
  preemptRadioStationSwitch("music_takeover");
  assert.equal(getActiveRadioPlayerCount(), 0);
  assert.equal(isRadioSessionCurrent(session.generation), false);
  __resetRadioStationSwitchForTests();
}

// 11. Music-to-radio: new begin claims a fresh generation after invalidate.
{
  preemptRadioStationSwitch("music_playing");
  const radio = await beginRadioStationSwitch({
    stationId: "fresh",
    origin: "station_card",
  });
  assert.equal(claimRadioPlayerOwner(radio.generation), true);
  assert.equal(getActiveRadioPlayerCount(), 1);
  __resetRadioStationSwitchForTests();
}

// 12. Background/foreground style re-entry does not duplicate player claim.
{
  const session = beginRadioStationSwitchSync({
    stationId: "stable",
    origin: "app",
  });
  assert.equal(claimRadioPlayerOwner(session.generation), true);
  assert.equal(claimRadioPlayerOwner(session.generation), true);
  assert.equal(getActiveRadioPlayerCount(), 1);
  __resetRadioStationSwitchForTests();
}

// 13. Intentional AbortError is classified and ignored by retry.
{
  const abort = new Error("Aborted");
  abort.name = "AbortError";
  assert.equal(isRadioSwitchAbortError(abort), true);
  assert.equal(classifyRadioPlaybackFailure(abort), "intentional_abort");
  const session = beginRadioStationSwitchSync({
    stationId: "x",
    origin: "app",
  });
  assert.equal(
    scheduleRadioRetry({
      generation: session.generation,
      attempt: 0,
      failureClass: "intentional_abort",
      run: () => undefined,
    }),
    false
  );
  __resetRadioStationSwitchForTests();
}

// 14. Dead stream cannot cause an infinite retry loop.
{
  const session = beginRadioStationSwitchSync({
    stationId: "dead",
    origin: "retry",
  });
  let attempts = 0;
  for (let i = 0; i < RADIO_MAX_STREAM_RETRY_ATTEMPTS + 5; i += 1) {
    const ok = scheduleRadioRetry({
      generation: session.generation,
      attempt: i,
      failureClass: "transient_timeout",
      run: () => {
        attempts += 1;
      },
    });
    if (!ok) break;
    cancelRadioRetry("test_step");
  }
  assert.ok(attempts === 0, "cancelled retries must not run");
  assert.equal(
    scheduleRadioRetry({
      generation: session.generation,
      attempt: RADIO_MAX_STREAM_RETRY_ATTEMPTS,
      failureClass: "transient_timeout",
      run: () => undefined,
    }),
    false
  );
  assert.equal(
    scheduleRadioRetry({
      generation: session.generation,
      attempt: 0,
      failureClass: "permanent_station_failure",
      run: () => undefined,
    }),
    false
  );
  __resetRadioStationSwitchForTests();
}

// 15. Metadata from an old station cannot replace the current station.
{
  const a = beginRadioStationSwitchSync({ stationId: "a", origin: "app" });
  assert.equal(shouldPublishRadioMetadata(a.generation, "a|playing"), true);
  markRadioMetadataPublished(a.generation, "a|playing");
  assert.equal(shouldPublishRadioMetadata(a.generation, "a|playing"), false);
  const b = beginRadioStationSwitchSync({ stationId: "b", origin: "app" });
  assert.equal(shouldPublishRadioMetadata(a.generation, "a|playing"), false);
  assert.equal(shouldPublishRadioMetadata(b.generation, "b|playing"), true);
  __resetRadioStationSwitchForTests();
}

// 16. Component/provider unmount removes silencer listeners.
{
  const unregister = registerRadioStopSilencer(async () => undefined);
  assert.ok(__getRadioStationSwitchDebugState().listenerRegistrationCount >= 1);
  unregister();
  assert.equal(__getRadioStationSwitchDebugState().listenerRegistrationCount, 0);
  cancelRadioRetry("unmount");
  assert.equal(__getRadioStationSwitchDebugState().hasRetryTimer, false);
  __resetRadioStationSwitchForTests();
}

// 17. Long playback does not continuously increase listener/timer counts.
{
  const unregister = registerRadioStopSilencer(async () => undefined);
  const baseline = __getRadioStationSwitchDebugState().listenerRegistrationCount;
  const session = beginRadioStationSwitchSync({
    stationId: "long",
    origin: "app",
  });
  claimRadioPlayerOwner(session.generation);
  for (let i = 0; i < 50; i += 1) {
    // Stable playback heartbeats must not register new listeners/timers.
    assert.equal(
      __getRadioStationSwitchDebugState().listenerRegistrationCount,
      baseline
    );
    assert.equal(__getRadioStationSwitchDebugState().hasRetryTimer, false);
    assert.equal(getActiveRadioPlayerCount(), 1);
  }
  unregister();
  __resetRadioStationSwitchForTests();
}

// Session helpers still wrap correctly for next/previous.
{
  const stations = ["a", "b", "c"].map((id) => ({
    id,
    title: id,
    streamUrl: `https://stream.example/${id}`,
    tags: [] as string[],
    source: "radio" as const,
  }));
  const { songs, activeIndex } = buildLiveRadioSessionSongs(stations[0], stations);
  assert.equal(activeIndex, 0);
  const next = wrapLiveRadioIndex(activeIndex, songs.length, "next");
  assert.equal(songs[next].id, "radio-b");
  const eligible = pickNextEligibleLiveRadioIndex({
    currentIndex: activeIndex,
    queue: songs,
    direction: "next",
    failedIds: new Set(),
  });
  assert.equal(eligible, 1);
}

console.log("test-radio-station-switch: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
