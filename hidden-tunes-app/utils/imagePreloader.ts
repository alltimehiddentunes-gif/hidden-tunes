import { Image } from "expo-image";
import { getPrefetchLimit, shouldRunNonEssentialWork } from "./performanceMode";
import { getNowPlayingSnapshot } from "./nowPlayingStore";
import {
  recordArtworkPrefetchAttempt,
  recordArtworkPrefetchFailure,
  recordArtworkPrefetchQueued,
  recordArtworkPrefetchSuccess,
} from "./playbackStressDiagnostics";
import { recordArtworkPrefetch } from "./runtimeInstrumentation";

const loadedImages = new Set<string>();
const loadedImageOrder: string[] = [];
const PRELOAD_BATCH_SIZE = 1;
const PRELOAD_MAX_IMAGES = 4;
const MAX_LOADED_IMAGES = 512;

/** Skip ahead-of-time prefetch while audio is playing (visible HTImage loads still run). */
function shouldSkipPrefetchDuringPlayback() {
  return getNowPlayingSnapshot().isPlaying;
}

function rememberLoadedImage(url: string) {
  if (loadedImages.has(url)) return;

  loadedImages.add(url);
  loadedImageOrder.push(url);

  while (loadedImageOrder.length > MAX_LOADED_IMAGES) {
    const oldest = loadedImageOrder.shift();
    if (oldest) loadedImages.delete(oldest);
  }
}

export async function preloadImages(
  images: Array<string | undefined | null>
) {
  try {
    if (shouldSkipPrefetchDuringPlayback()) return;
    if (!shouldRunNonEssentialWork()) return;

    const maxImages = getPrefetchLimit(PRELOAD_MAX_IMAGES);
    if (maxImages <= 0) return;

    const validImages = Array.from(
      new Set(
        images
          .filter(Boolean)
          .map((img) => String(img))
          .filter((img) => img.startsWith("http"))
          .filter((img) => !loadedImages.has(img))
      )
    ).slice(0, maxImages);

    if (!validImages.length) return;

    recordArtworkPrefetchQueued(validImages.length);
    recordArtworkPrefetchAttempt(validImages.length);

    for (let index = 0; index < validImages.length; index += PRELOAD_BATCH_SIZE) {
      const batch = validImages.slice(index, index + PRELOAD_BATCH_SIZE);

      await Promise.all(
        batch.map(async (img) => {
          try {
            recordArtworkPrefetch(img, "image_preloader");
            await Image.prefetch(img);
            rememberLoadedImage(img);
            recordArtworkPrefetchSuccess(1);
          } catch {
            recordArtworkPrefetchFailure(1);
          }
        })
      );
    }
  } catch {}
}

export function clearImagePreloadCache() {
  loadedImages.clear();
  loadedImageOrder.length = 0;
}

export function getImagePrefetchStatus() {
  const active = shouldRunNonEssentialWork();

  return {
    active,
    paused: !active,
    loadedCount: loadedImages.size,
  };
}
