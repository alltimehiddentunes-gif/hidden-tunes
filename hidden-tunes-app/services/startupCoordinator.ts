import { AppState } from "react-native";

import { logBackgroundWork } from "../utils/backgroundWork";
import { HIDDEN_TUNES_GENRES } from "../utils/genres";
import { prefetchGenreCatalogNavigation } from "../utils/catalogNavigation";
import { scheduleStartupTask } from "../utils/startupScheduler";
import { getNowPlayingSnapshot } from "../utils/nowPlayingStore";
import { logPlaybackDiagnostic } from "./playbackDiagnostics"; // TEMP_PLAYBACK_DIAGNOSTICS
import { hydrateHiddenTunesCatalogCache } from "./hiddenTunesApi";
import { prewarmTrackPlayerForStartup } from "./playbackBridge";
import { ensureCatalogViewPersistenceHydrated } from "./unifiedCatalog";

let tabShellStartupStarted = false;

export function runTabShellStartup() {
  if (tabShellStartupStarted) return;
  tabShellStartupStarted = true;

  scheduleStartupTask("afterPaint", "catalog_memory_hydrate", async () => {
    await hydrateHiddenTunesCatalogCache();
  });

  scheduleStartupTask("afterPaint", "rntp_prewarm", async () => {
    await prewarmTrackPlayerForStartup();
  });

  scheduleStartupTask("afterInteraction", "catalog_persistence_hydrate", async () => {
    await ensureCatalogViewPersistenceHydrated();
  });

  scheduleStartupTask("idle", "genre_prewarm_primary", async () => {
    if (AppState.currentState !== "active") {
      // TEMP_PLAYBACK_DIAGNOSTICS
      void logPlaybackDiagnostic("startup_task_skipped", {
        name: "genre_prewarm_primary",
        reason: "app_not_active",
        appState: AppState.currentState,
      });
      return;
    }

    const nowPlaying = getNowPlayingSnapshot();
    if (nowPlaying.currentSongId || nowPlaying.isPlaying) {
      // TEMP_PLAYBACK_DIAGNOSTICS
      void logPlaybackDiagnostic("startup_task_skipped", {
        name: "genre_prewarm_primary",
        reason: "now_playing_exists",
        currentSongId: nowPlaying.currentSongId,
        isPlaying: nowPlaying.isPlaying,
      });
      return;
    }

    logBackgroundWork("delayed-genre-prewarm");
    const primaryGenre = HIDDEN_TUNES_GENRES[0];
    if (!primaryGenre) return;

    prefetchGenreCatalogNavigation({
      id: primaryGenre.id,
      title: primaryGenre.title,
      query: primaryGenre.query,
    });
  });
}
