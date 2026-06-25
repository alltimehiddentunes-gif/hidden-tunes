import { MATURE_DISCOVERY_PAGE_SIZE } from "../constants/matureDiscoveryFoundation";
import {
  getAllMaturePodcastQueryGroupIds,
  getMaturePodcastQueryGroup,
} from "../constants/maturePodcastQueryGroups";
import { isMatureDiscoveryDiagnosticsEnabled } from "./devDiagnostics";
import { loadMaturePodcastCategoryPage } from "../services/mature/maturePodcastDiscovery";
import { loadMatureRadioHubLanePage } from "../services/mature/matureRadioHubLanes";
import {
  logMatureInventoryAuditSummary,
  logMatureDiscovery,
} from "./matureDiscoveryDiagnostics";
import { isMaturePlayableShow } from "../services/mature/matureQualityFilters";

let podcastAuditStarted = false;
let radioAuditStarted = false;

/** Dev-only mature podcast inventory audit — one run per app session when diagnostics are on. */
export async function runMaturePodcastInventoryAuditIfEnabled() {
  if (!isMatureDiscoveryDiagnosticsEnabled() || podcastAuditStarted) return;
  podcastAuditStarted = true;

  logMatureDiscovery("mature_podcast_inventory_audit_start", {
    categories: getAllMaturePodcastQueryGroupIds().length,
  });

  const categorySummaries: Record<string, number> = {};
  const weakCategories: string[] = [];
  const strongCategories: string[] = [];

  for (const groupId of getAllMaturePodcastQueryGroupIds()) {
    const group = getMaturePodcastQueryGroup(groupId);
    if (!group) continue;

    const categoryId = `mature-${groupId}`;
    const result = await loadMaturePodcastCategoryPage(categoryId, 0, {
      allowSparseExpansion: true,
    }).catch(() => ({ shows: [], hasMore: false }));

    const playable = result.shows.filter(isMaturePlayableShow);
    categorySummaries[group.title] = playable.length;

    if (playable.length >= 40) {
      strongCategories.push(group.title);
    } else if (playable.length < 10) {
      weakCategories.push(group.title);
    }
  }

  logMatureInventoryAuditSummary("podcast", {
    categoryCounts: JSON.stringify(categorySummaries),
    strongCategories40Plus: strongCategories.join(", "),
    weakCategoriesUnder10: weakCategories.join(", "),
    backendNote: "HT /api/podcasts returns 404 — iTunes/RSS fallback is live source",
  });
}

/** Dev-only mature radio inventory audit — one run per app session when diagnostics are on. */
export async function runMatureRadioInventoryAuditIfEnabled() {
  if (!isMatureDiscoveryDiagnosticsEnabled() || radioAuditStarted) return;
  radioAuditStarted = true;

  const result = await loadMatureRadioHubLanePage({ forceRefresh: true }).catch(() => ({
    stations: [],
    hasMore: false,
  }));

  const playable = result.stations.filter((station) =>
    String(station.streamUrl || "").trim().startsWith("https://")
  );

  logMatureInventoryAuditSummary("radio", {
    rawStations: result.stations.length,
    playableStreams: playable.length,
    httpsStreams: playable.length,
    finalDisplayedCount: Math.min(playable.length, MATURE_DISCOVERY_PAGE_SIZE),
    first20StationNames: playable
      .slice(0, 20)
      .map((station) => String(station.name || "").trim())
      .join(" | "),
  });
}

export function scheduleMatureInventoryAuditIfEnabled() {
  if (!isMatureDiscoveryDiagnosticsEnabled()) return;

  setTimeout(() => {
    void runMaturePodcastInventoryAuditIfEnabled();
    void runMatureRadioInventoryAuditIfEnabled();
  }, 2500);
}
