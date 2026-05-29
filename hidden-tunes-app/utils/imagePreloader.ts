import { Image } from "expo-image";
import { AppState } from "react-native";
import {
  logPlaybackDiagnostic,
  logPlaybackDiagnosticChurnWarning,
} from "../services/playbackDiagnostics"; // TEMP_PLAYBACK_DIAGNOSTICS
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
const PRELOAD_BATCH_SIZE = 1;
const PRELOAD_MAX_IMAGES = 4;

/** Skip ahead-of-time prefetch while audio is playing (visible HTImage loads still run). */
function shouldSkipPrefetchDuringPlayback() {
  return getNowPlayingSnapshot().isPlaying;
}

export async function preloadImages(
  images: Array<string | undefined | null>
) {
  try {
    if (AppState.currentState !== "active") {
      // TEMP_PLAYBACK_DIAGNOSTICS
      void logPlaybackDiagnostic("startup_task_skipped", {
        name: "image_preload",
        reason: "app_not_active",
        appState: AppState.currentState,
      });
      return;
    }

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

    // TEMP_PLAYBACK_DIAGNOSTICS
    logPlaybackDiagnosticChurnWarning("image_preloads", {
      requested: images.length,
      queued: validImages.length,
    });
    // TEMP_PLAYBACK_DIAGNOSTICS
    void logPlaybackDiagnostic("image_preload_start", {
      requested: images.length,
      queued: validImages.length,
    });
    recordArtworkPrefetchQueued(validImages.length);
    recordArtworkPrefetchAttempt(validImages.length);

    for (let index = 0; index < validImages.length; index += PRELOAD_BATCH_SIZE) {
      const batch = validImages.slice(index, index + PRELOAD_BATCH_SIZE);

      await Promise.all(
        batch.map(async (img) => {
          try {
            recordArtworkPrefetch(img, "image_preloader");
            await Image.prefetch(img);
            loadedImages.add(img);
            recordArtworkPrefetchSuccess(1);
          } catch {
            // TEMP_PLAYBACK_DIAGNOSTICS
            void logPlaybackDiagnostic("image_preload_failure", {
              source: "image_preloader",
            });
            recordArtworkPrefetchFailure(1);
          }
        })
      );
    }
    // TEMP_PLAYBACK_DIAGNOSTICS
    void logPlaybackDiagnostic("image_preload_complete", {
      queued: validImages.length,
      loadedCount: loadedImages.size,
    });
  } catch {}
}

export function clearImagePreloadCache() {
  loadedImages.clear();
}

export function getImagePrefetchStatus() {
  const active = shouldRunNonEssentialWork();

  return {
    active,
    paused: !active,
    loadedCount: loadedImages.size,
  };
}
