import { MATURE_DISCOVERY_PAGE_SIZE } from "../constants/matureDiscoveryFoundation";
import { isMatureDiscoveryDiagnosticsEnabled } from "./devDiagnostics";
import { loadMatureRadioHubLanePage } from "../services/mature/matureRadioHubLanes";
import { logMatureInventoryAuditSummary } from "./matureDiscoveryDiagnostics";

let radioAuditStarted = false;

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

  logMatureInventoryAuditSummary({
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
    void runMatureRadioInventoryAuditIfEnabled();
  }, 2500);
}
