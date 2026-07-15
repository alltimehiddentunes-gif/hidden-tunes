import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFastRunnerEnv } from "../lib/tvExpansion25k/fast/stageLog";
import { TvDedupeCache } from "../lib/tvExpansion25k/fast/dedupeCache";
import { filterCandidatesPreVerification } from "../lib/tvExpansion25k/fast/preVerificationFilter";
import { getWave4NormalSourceAdapters } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";
import { DomainConcurrencyLimiter } from "../lib/tvExpansion25k/fast/domainLimiter";
import { mapWithConcurrency } from "../lib/tvExpansion25k/fast/workerPool";
import { probeTvStation, validatePublicTvUrl } from "../lib/tvStationHealth";
import {
  TvVerificationDiagnostics,
  redactStreamUrlForReport,
} from "../lib/tvExpansion25k/fast/verificationDiagnostics";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
loadFastRunnerEnv(adminRoot);

const SOURCE = process.env.TV_YIELD_SOURCE || "official-fast-providers-wave4";
const UNIQUE_SAMPLE = Number(process.env.TV_UNIQUE_SAMPLE || "80");
const DISCOVER_LIMIT = Number(process.env.TV_DISCOVER_LIMIT || "1200");

async function main() {
  const adapter = getWave4NormalSourceAdapters().find((row) => row.id === SOURCE);
  if (!adapter) throw new Error(`Unknown source ${SOURCE}`);

  const discovered = await adapter.discover({
    limit: DISCOVER_LIMIT,
    cursor: createInitialSourceCursor(SOURCE),
    batchNumber: 1,
  });
  const pre = filterCandidatesPreVerification(discovered.candidates);
  const cache = new TvDedupeCache();
  await cache.ensureLoaded();
  const afterDedupe = await cache.prefilter(pre.accepted);
  const sample = afterDedupe.accepted.slice(0, UNIQUE_SAMPLE);

  const diagnostics = new TvVerificationDiagnostics();
  const hostLimiter = new DomainConcurrencyLimiter(2);
  const passes: Array<{ id: string; country: string | null; url: string }> = [];
  const byCountry: Record<string, { attempted: number; passed: number }> = {};

  await mapWithConcurrency(sample, 8, async (candidate) => {
    const country = String(candidate.country || candidate.region || "unknown").toUpperCase();
    byCountry[country] = byCountry[country] || { attempted: 0, passed: 0 };
    byCountry[country].attempted += 1;

    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) {
      diagnostics.recordFailure(urlCheck.reason, String(candidate.source_url || ""), country, 0);
      return;
    }

    await hostLimiter.run(urlCheck.url, async () => {
      const started = Date.now();
      const probe = await probeTvStation({
        id: "unique",
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
      const durationMs = Date.now() - started;
      if (probe.playable) {
        diagnostics.recordPass(durationMs);
        byCountry[country].passed += 1;
        passes.push({
          id: candidate.source_id,
          country,
          url: redactStreamUrlForReport(urlCheck.url),
        });
      } else {
        diagnostics.recordFailure(
          probe.reason || probe.last_validation_result || "unknown",
          urlCheck.url,
          country,
          durationMs
        );
      }
    });
  });

  const summary = diagnostics.summary();
  const passRate = summary.total > 0 ? summary.passed / summary.total : 0;
  const projectedFromInventory =
    afterDedupe.accepted.length > 0
      ? Math.round(afterDedupe.accepted.length * passRate)
      : 0;

  console.log(
    JSON.stringify(
      {
        source: SOURCE,
        discovered: discovered.candidates.length,
        prefilterRejected: pre.rejected,
        uniqueAfterDedupe: afterDedupe.accepted.length,
        dedupeRemoved: afterDedupe.removed,
        uniqueSampleVerified: summary.total,
        uniqueSamplePassed: summary.passed,
        uniqueSampleFailed: summary.failed,
        passRate: Number(passRate.toFixed(4)),
        projectedUniqueAdditions: projectedFromInventory,
        averageVerificationMs: summary.averageDurationMs,
        failureReasons: summary.byReason,
        byCountry,
        samplePasses: passes.slice(0, 12),
        database_writes: 0,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
