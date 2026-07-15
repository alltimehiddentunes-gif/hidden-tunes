import { getWave4NormalSourceAdapters } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";
import { probeTvStation, validatePublicTvUrl } from "../lib/tvStationHealth";
import { classifyVerificationFailure } from "../lib/tvExpansion25k/fast/verificationDiagnostics";
import { redactStreamUrlForReport } from "../lib/tvExpansion25k/fast/verificationDiagnostics";

const SOURCE = process.env.TV_PROBE_SOURCE || "country-official-manifests-wave4";
const LIMIT = Number(process.env.TV_PROBE_LIMIT || "12");

async function main() {
  const adapter = getWave4NormalSourceAdapters().find((row) => row.id === SOURCE);
  if (!adapter) throw new Error(`Unknown source ${SOURCE}`);
  const discovered = await adapter.discover({
    limit: LIMIT,
    cursor: createInitialSourceCursor(SOURCE),
    batchNumber: 1,
  });

  const rows = [];
  for (const candidate of discovered.candidates.slice(0, LIMIT)) {
    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) {
      rows.push({
        id: candidate.source_id,
        url: redactStreamUrlForReport(String(candidate.source_url || "")),
        playable: false,
        reason: urlCheck.reason,
        classified: classifyVerificationFailure(urlCheck.reason),
      });
      continue;
    }
    const probe = await probeTvStation({
      id: "diag",
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: candidate.embed_url || null,
      title: candidate.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });
    const raw = probe.reason || probe.last_validation_result || "unknown";
    rows.push({
      id: candidate.source_id,
      url: redactStreamUrlForReport(urlCheck.url),
      playable: probe.playable,
      reason: probe.reason,
      lastValidation: probe.last_validation_result,
      protocol: probe.stream_protocol,
      ios: probe.ios_playable,
      android: probe.android_playable,
      classified: classifyVerificationFailure(raw),
    });
  }

  console.log(JSON.stringify({ source: SOURCE, count: rows.length, rows }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
