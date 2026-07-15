import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TV_FAST_CONFIG } from "../lib/tvExpansion25k/fast/config";
import { filterCandidatesPreVerification } from "../lib/tvExpansion25k/fast/preVerificationFilter";
import { TvVerificationDiagnostics } from "../lib/tvExpansion25k/fast/verificationDiagnostics";
import { getWave4NormalSourceAdapters } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";
import { probeTvStation, validatePublicTvUrl } from "../lib/tvStationHealth";
import { mapWithConcurrency } from "../lib/tvExpansion25k/fast/workerPool";
import { DomainConcurrencyLimiter } from "../lib/tvExpansion25k/fast/domainLimiter";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const SAMPLE_SIZE = Number(process.env.TV_YIELD_SAMPLE_SIZE || "40");
const SOURCE_IDS = (process.env.TV_YIELD_SOURCES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function discoverSample(sourceId: string) {
  const adapter = getWave4NormalSourceAdapters().find((row) => row.id === sourceId);
  if (!adapter) throw new Error(`Unknown source: ${sourceId}`);

  const result = await adapter.discover({
    limit: SAMPLE_SIZE * 3,
    cursor: createInitialSourceCursor(sourceId),
    batchNumber: 1,
  });

  return result.candidates.slice(0, SAMPLE_SIZE);
}

async function auditSource(sourceId: string) {
  const discovered = await discoverSample(sourceId);
  const preVerification = filterCandidatesPreVerification(discovered);
  const diagnostics = new TvVerificationDiagnostics();
  const hostLimiter = new DomainConcurrencyLimiter(TV_FAST_CONFIG.perHostConcurrency);

  await mapWithConcurrency(
    preVerification.accepted,
    Math.min(8, TV_FAST_CONFIG.verifyConcurrency),
    async (candidate) => {
      const started = Date.now();
      const urlCheck = validatePublicTvUrl(candidate.source_url);
      if (!urlCheck.ok) {
        diagnostics.recordFailure(urlCheck.reason, String(candidate.source_url || ""), candidate.country, Date.now() - started);
        return;
      }
      await hostLimiter.run(urlCheck.url, async () => {
        const probeStarted = Date.now();
        const probe = await probeTvStation({
          id: "sample",
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
        const durationMs = Date.now() - probeStarted;
        if (probe.playable) {
          diagnostics.recordPass(durationMs);
        } else {
          diagnostics.recordFailure(
            probe.reason || probe.last_validation_result || "unknown",
            urlCheck.url,
            candidate.country || candidate.region,
            durationMs
          );
        }
      });
    }
  );

  const summary = diagnostics.summary();
  const passRate = summary.total > 0 ? summary.passed / summary.total : 0;

  return {
    source: sourceId,
    raw: discovered.length,
    unique: preVerification.accepted.length,
    prefilterRejected: preVerification.rejected,
    prefilterReasons: preVerification.reasons,
    verificationAttempted: summary.total,
    verificationPassed: summary.passed,
    verificationFailed: summary.failed,
    passRate: Number(passRate.toFixed(4)),
    terminalFailureRate:
      summary.total > 0 ? Number((summary.terminal / summary.total).toFixed(4)) : 0,
    retryableFailureRate:
      summary.total > 0 ? Number((summary.retryable / summary.total).toFixed(4)) : 0,
    averageVerificationMs: summary.averageDurationMs,
    failureReasons: summary.byReason,
    topHosts: Object.entries(summary.byHost)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([host, count]) => ({ host, count })),
    projectedUniqueAdditions: summary.passed,
    recommendedPriority:
      passRate >= 0.15 ? "high" : passRate >= 0.05 ? "medium" : passRate > 0 ? "low" : "deprioritize",
  };
}

async function main() {
  const defaultSources = [
    "country-official-manifests-wave4",
    "parliament-government-wave4",
    "international-news-wave4",
    "religious-education-wave4",
    "education-culture-wave4",
    "iptv-org-github-countries-wave4",
    "free-community-playlists-wave4",
    "regional-community-wave4",
  ];

  const sources = SOURCE_IDS.length > 0 ? SOURCE_IDS : defaultSources;
  const rows = [];

  for (const sourceId of sources) {
    rows.push(await auditSource(sourceId));
  }

  const report = {
    at: new Date().toISOString(),
    sampleSize: SAMPLE_SIZE,
    sources: rows,
  };

  const outPath = path.join(adminRoot, "data/tv-expansion-wave4/source-yield-audit.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
