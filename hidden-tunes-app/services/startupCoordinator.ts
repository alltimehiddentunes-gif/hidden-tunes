import { HIDDEN_TUNES_GENRES } from "../utils/genres";
import { prefetchGenreCatalogNavigation } from "../utils/catalogNavigation";
import { scheduleStartupTask } from "../utils/startupScheduler";
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

  scheduleStartupTask("background", "genre_prewarm_primary", async () => {
    const primaryGenre = HIDDEN_TUNES_GENRES[0];
    if (!primaryGenre) return;

    prefetchGenreCatalogNavigation({
      id: primaryGenre.id,
      title: primaryGenre.title,
      query: primaryGenre.query,
    });
  });
}
