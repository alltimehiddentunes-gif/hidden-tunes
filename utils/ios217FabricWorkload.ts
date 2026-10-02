import { getNowPlayingSnapshot } from "./nowPlayingStore";

/**
 * 217 Fabric workload counters — JS/OTA diagnostic only.
 * Cheap increments while a sample is active. No hot-path logging.
 * Bucketed by PAUSED vs PLAYING for delta reports.
 */

export type FabricWorkloadMode = "paused" | "playing" | "idle";

export type FabricWorkloadCounter =
  | "rowMounts"
  | "rowUnmounts"
  | "rowLayouts"
  | "viewabilityCallbacks"
  | "listDataIdentityChanges"
  | "extraDataIdentityChanges"
  | "renderItemIdentityChanges"
  | "keyExtractorIdentityChanges"
  | "carouselMounts"
  | "carouselUnmounts"
  | "imageMounts"
  | "imageUnmounts"
  | "imageSourceChanges"
  | "artworkSourceChanges"
  | "imageLoadStarts"
  | "imageLoadCompletions"
  | "animationStarts"
  | "animationStops"
  | "animationsPausedChanges"
  | "animatedComponentsMounted"
  | "offscreenAnimationsActiveSamples"
  | "pathnameNotifications"
  | "pathnameActualChanges"
  | "backgroundVariantNotifications"
  | "backgroundVariantActualChanges"
  | "offscreenMountedScreensSamples"
  | "offscreenActiveScreensMax"
  | "miniPlayerMounts"
  | "miniPlayerUnmounts"
  | "miniArtworkRenders"
  | "miniArtworkMounts"
  | "miniArtworkUnmounts"
  | "miniArtworkSourceChanges"
  | "miniProgressRenders"
  | "miniPlayPauseRenders"
  | "miniLayouts"
  | "miniAnimations"
  | "miniShellPaddingChanges";

const COUNTERS: FabricWorkloadCounter[] = [
  "rowMounts",
  "rowUnmounts",
  "rowLayouts",
  "viewabilityCallbacks",
  "listDataIdentityChanges",
  "extraDataIdentityChanges",
  "renderItemIdentityChanges",
  "keyExtractorIdentityChanges",
  "carouselMounts",
  "carouselUnmounts",
  "imageMounts",
  "imageUnmounts",
  "imageSourceChanges",
  "artworkSourceChanges",
  "imageLoadStarts",
  "imageLoadCompletions",
  "animationStarts",
  "animationStops",
  "animationsPausedChanges",
  "animatedComponentsMounted",
  "offscreenAnimationsActiveSamples",
  "pathnameNotifications",
  "pathnameActualChanges",
  "backgroundVariantNotifications",
  "backgroundVariantActualChanges",
  "offscreenMountedScreensSamples",
  "offscreenActiveScreensMax",
  "miniPlayerMounts",
  "miniPlayerUnmounts",
  "miniArtworkRenders",
  "miniArtworkMounts",
  "miniArtworkUnmounts",
  "miniArtworkSourceChanges",
  "miniProgressRenders",
  "miniPlayPauseRenders",
  "miniLayouts",
  "miniAnimations",
  "miniShellPaddingChanges",
];

type Bucket = Record<FabricWorkloadCounter, number>;

function blank(): Bucket {
  const out = Object.create(null) as Bucket;
  for (const key of COUNTERS) out[key] = 0;
  return out;
}

let sampleActive = false;
const paused = blank();
const playing = blank();

function currentMode(): FabricWorkloadMode {
  if (!sampleActive) return "idle";
  return getNowPlayingSnapshot().isPlaying ? "playing" : "paused";
}

function bucketFor(mode: FabricWorkloadMode): Bucket | null {
  if (mode === "paused") return paused;
  if (mode === "playing") return playing;
  return null;
}

export function setIos217FabricWorkloadSampleActive(active: boolean) {
  sampleActive = !!active;
  if (!active) return;
  for (const key of COUNTERS) {
    paused[key] = 0;
    playing[key] = 0;
  }
}

export function resetIos217FabricWorkload() {
  for (const key of COUNTERS) {
    paused[key] = 0;
    playing[key] = 0;
  }
}

export function countIos217Fabric(kind: FabricWorkloadCounter, amount = 1) {
  if (!sampleActive || amount === 0) return;
  const bucket = bucketFor(currentMode());
  if (!bucket) return;
  bucket[kind] += amount;
}

/** Sample max of currently mounted offscreen screens (Home focused). */
export function sampleIos217OffscreenMountedScreens(count: number) {
  if (!sampleActive) return;
  const bucket = bucketFor(currentMode());
  if (!bucket) return;
  bucket.offscreenMountedScreensSamples += 1;
  if (count > bucket.offscreenActiveScreensMax) {
    bucket.offscreenActiveScreensMax = count;
  }
}

export function sampleIos217OffscreenAnimationsActive(activeCount: number) {
  if (!sampleActive || activeCount <= 0) return;
  const bucket = bucketFor(currentMode());
  if (!bucket) return;
  bucket.offscreenAnimationsActiveSamples += 1;
}

function formatBucket(label: string, bucket: Bucket): string {
  return `${label}=${COUNTERS.map((k) => `${k}:${bucket[k]}`).join(",")}`;
}

function deltaLine(): string {
  const parts: string[] = [];
  let largest = "";
  let largestDelta = Number.NEGATIVE_INFINITY;
  for (const key of COUNTERS) {
    const d = playing[key] - paused[key];
    if (d !== 0) parts.push(`${key}:${d >= 0 ? "+" : ""}${d}`);
    if (d > largestDelta) {
      largestDelta = d;
      largest = `${key}:${d >= 0 ? "+" : ""}${d}`;
    }
  }
  return [
    `fabricDelta=${parts.length ? parts.join(",") : "(none)"}`,
    `largestPlayingOnlyFabricDelta=${largest || "(none)"}`,
  ].join("\n");
}

export function formatIos217FabricWorkload(): string {
  return [
    formatBucket("fabricPaused", paused),
    formatBucket("fabricPlaying", playing),
    deltaLine(),
  ].join("\n");
}

export function getIos217FabricWorkloadSnapshot() {
  return {
    paused: { ...paused },
    playing: { ...playing },
  };
}
