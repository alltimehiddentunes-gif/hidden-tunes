/**
 * Focused tests for TV Now Playing metadata + remote transport ownership.
 * Run: npx --yes tsx scripts/test-tv-now-playing-media-session.ts
 */

import {
  __resetPlaybackHandoffForTests,
  claimExclusivePlayback,
  getActivePlaybackOwner,
  isPlaybackOwnerActive,
  registerPlaybackOwnerAdapter,
} from "../services/playback/PlaybackHandoffCoordinator";
import { buildTvNowPlayingMetadata } from "../services/tv/tvNowPlayingMetadata";
import { dispatchTvRemoteTransportCommand } from "../services/tv/tvRemoteTransport";
import {
  registerTvSessionController,
  type TvSessionControllerApi,
} from "../services/tv/tvSessionController";
import type { HiddenTunesTvVideo } from "../services/tvCatalogApi";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function sampleVideo(overrides: Partial<HiddenTunesTvVideo> = {}): HiddenTunesTvVideo {
  return {
    id: "tv-bbc-news",
    title: "BBC News (1080p)",
    channel_name: "BBC",
    logo: "https://cdn.example.com/bbc-news.png",
    thumbnail_url: null,
    categories: ["News"],
    category: "News",
    country: "GB",
    ...overrides,
  };
}

async function main() {
  // --- Title / artwork mapping ---
  const mapped = buildTvNowPlayingMetadata(sampleVideo());
  assert(mapped !== null, "maps channel metadata");
  assertEqual(mapped!.title, "BBC News", "strips quality suffix from title");
  assertEqual(mapped!.artist, "BBC", "uses channel_name as subtitle");
  assertEqual(mapped!.durationMillis, 0, "live TV has no fake duration");
  assertEqual(mapped!.positionMillis, 0, "live TV has no inherited elapsed");
  assertEqual(mapped!.canSeek, false, "live TV cannot seek");
  assertEqual(mapped!.isLive, true, "marked live");
  assert(
    mapped!.artworkUri.includes("bbc-news.png") || mapped!.artworkUri.length > 0,
    "artwork resolved"
  );

  const withProgramme = buildTvNowPlayingMetadata(sampleVideo(), {
    title: "World News",
  });
  assertEqual(withProgramme!.title, "World News", "programme title preferred");
  assertEqual(withProgramme!.artist, "BBC", "channel/network becomes subtitle with programme");

  const rawUrlTitle = buildTvNowPlayingMetadata(
    sampleVideo({ title: "https://evil.example/stream.m3u8", channel_name: "CNN" })
  );
  assertEqual(rawUrlTitle!.title, "CNN", "rejects URL titles");

  // Live mapping never invents duration/elapsed for RemoteMedia publishers.
  assertEqual(mapped!.durationMillis, 0, "publisher must send duration 0");
  assertEqual(mapped!.positionMillis, 0, "publisher must send elapsed 0");

  // --- Ownership claim + transport routing ---
  __resetPlaybackHandoffForTests();
  const stops: string[] = [];
  const clears: string[] = [];
  const transportLog: string[] = [];
  let tvPlaying = false;
  let queueIndex = 0;
  const queue = [sampleVideo(), sampleVideo({ id: "tv-2", title: "Channel Two" })];

  registerPlaybackOwnerAdapter({
    id: "shared-audio",
    stopImmediately: () => {
      stops.push("shared-audio");
    },
    clearPresentedState: () => {
      clears.push("shared-audio");
    },
  });
  registerPlaybackOwnerAdapter({
    id: "tv",
    stopImmediately: () => {
      stops.push("tv");
      tvPlaying = false;
    },
    clearPresentedState: () => {
      clears.push("tv");
    },
    isActive: () => isPlaybackOwnerActive("tv"),
  });

  const api: TvSessionControllerApi = {
    startCatalogSession: async () => ({ ok: true }),
    startSeedSession: async () => ({ ok: true }),
    startResolvedSession: async () => ({ ok: true }),
    stopSession: () => {
      transportLog.push("stop");
      tvPlaying = false;
    },
    setPresentationMode: () => {},
    getPresentationMode: () => "floating",
    isSessionActive: () => true,
    getActiveItemId: () => queue[queueIndex]?.id ?? null,
    setPlaying: (playing) => {
      transportLog.push(playing ? "play" : "pause");
      tvPlaying = playing;
    },
    isPlaying: () => tvPlaying,
    nextChannel: () => {
      transportLog.push("next");
      queueIndex = (queueIndex + 1) % queue.length;
    },
    previousChannel: () => {
      transportLog.push("previous");
      queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    },
    canGoNext: () => queue.length > 1,
    canGoPrevious: () => queue.length > 1,
    getActiveVideo: () => queue[queueIndex] ?? null,
    getQueueLength: () => queue.length,
    getQueueIndex: () => queueIndex,
  };
  registerTvSessionController(api);

  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "music",
    mediaKey: "song-1",
  });
  assertEqual(getActivePlaybackOwner(), "shared-audio", "music owns first");

  stops.length = 0;
  clears.length = 0;
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-bbc-news",
  });
  assert(isPlaybackOwnerActive("tv"), "TV claims active media ownership");
  assert(stops.includes("shared-audio"), "TV peer-stops shared-audio");
  assert(clears.includes("shared-audio"), "TV clears previous presented metadata owner");

  transportLog.length = 0;
  assert(dispatchTvRemoteTransportCommand("play"), "remote play accepted");
  assert(dispatchTvRemoteTransportCommand("pause"), "remote pause accepted");
  assert(dispatchTvRemoteTransportCommand("next"), "remote next uses TV queue");
  assert(dispatchTvRemoteTransportCommand("previous"), "remote previous uses TV queue");
  assertEqual(transportLog.join(","), "play,pause,next,previous", "TV transport order");
  assertEqual(tvPlaying, false, "pause left TV paused");

  // No inventing next when queue length is 1
  registerTvSessionController({
    ...api,
    canGoNext: () => false,
    canGoPrevious: () => false,
    getQueueLength: () => 1,
  });
  assertEqual(
    dispatchTvRemoteTransportCommand("next"),
    false,
    "no next when TV queue is single"
  );

  // TV → music ownership transition clears TV
  stops.length = 0;
  clears.length = 0;
  await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "music",
    mediaKey: "song-2",
  });
  assertEqual(getActivePlaybackOwner(), "shared-audio", "music replaces TV owner");
  assert(stops.includes("tv"), "music stops TV");
  assert(clears.includes("tv"), "music clears TV presented metadata");

  // Music → TV again
  await claimExclusivePlayback({
    owner: "tv",
    contentKind: "tv",
    mediaKey: "tv-bbc-news",
  });
  assertEqual(getActivePlaybackOwner(), "tv", "TV replaces music owner again");

  registerTvSessionController(null);
  console.log("OK: TV now-playing media session contracts passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
