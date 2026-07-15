import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFastRunnerEnv } from "../lib/tvExpansion25k/fast/stageLog";
import { getWave4NormalSourceAdapters } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";
import { filterCandidatesPreVerification } from "../lib/tvExpansion25k/fast/preVerificationFilter";
import { TvDedupeCache } from "../lib/tvExpansion25k/fast/dedupeCache";
import { probeTvStation, validatePublicTvUrl } from "../lib/tvStationHealth";
import { redactStreamUrlForReport } from "../lib/tvExpansion25k/fast/verificationDiagnostics";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
loadFastRunnerEnv(adminRoot);

const LIMIT = Number(process.env.TV_YIELD_SAMPLE_SIZE || "80");
const SOURCE = "free-community-playlists-wave4";

async function main() {
  const adapter = getWave4NormalSourceAdapters().find((row) => row.id === SOURCE)!;
  const discovered = await adapter.discover({
    limit: LIMIT,
    cursor: createInitialSourceCursor(SOURCE),
    batchNumber: 1,
  });
  const pre = filterCandidatesPreVerification(discovered.candidates);
  const cache = new TvDedupeCache();
  await cache.ensureLoaded();
  const afterDedupe = await cache.prefilter(pre.accepted);

  let passed = 0;
  let passedUnique = 0;
  const uniquePasses: string[] = [];

  for (const candidate of afterDedupe.accepted.slice(0, 40)) {
    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) continue;
    const probe = await probeTvStation({
      id: "x",
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: null,
      title: candidate.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });
    if (probe.playable) {
      passedUnique += 1;
      uniquePasses.push(redactStreamUrlForReport(urlCheck.url));
    }
  }

  for (const candidate of pre.accepted.slice(0, 20)) {
    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) continue;
    const probe = await probeTvStation({
      id: "y",
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: null,
      title: candidate.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });
    if (probe.playable) passed += 1;
  }

  console.log(
    JSON.stringify(
      {
        raw: discovered.candidates.length,
        prefilterAccepted: pre.accepted.length,
        prefilterRejected: pre.rejected,
        afterDedupeUnique: afterDedupe.accepted.length,
        dedupeRemoved: afterDedupe.removed,
        samplePassesWithoutDedupeFirst20: passed,
        samplePassesAmongUniqueFirst40: passedUnique,
        uniquePassUrls: uniquePasses,
      },
      null,
      2
    )
  );
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
