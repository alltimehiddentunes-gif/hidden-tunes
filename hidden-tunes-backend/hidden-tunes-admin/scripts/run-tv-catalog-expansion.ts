import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

import type { TvGrowthCandidate } from "../lib/tvStationHealth";

loadEnvFile(path.join(adminRoot, ".env.local"));

type ExpansionOptions = {
  dryRun: boolean;
  import: boolean;
  reportOnly: boolean;
  probeOnly: boolean;
  probeLimit: number;
  concurrency: number;
};

function parseArgs(argv: string[]): ExpansionOptions {
  const options: ExpansionOptions = {
    dryRun: argv.includes("--dry-run"),
    import: argv.includes("--import"),
    reportOnly: argv.includes("--report-only"),
    probeOnly: argv.includes("--probe-only"),
    probeLimit: 0,
    concurrency: 5,
  };

  const probeLimitIndex = argv.indexOf("--probe-limit");
  if (probeLimitIndex >= 0) {
    options.probeLimit = Number(argv[probeLimitIndex + 1] || 0);
  }

  const concurrencyIndex = argv.indexOf("--concurrency");
  if (concurrencyIndex >= 0) {
    options.concurrency = Math.max(1, Number(argv[concurrencyIndex + 1] || 5));
  }

  if (!options.dryRun && !options.import && !options.reportOnly && !options.probeOnly) {
    options.dryRun = true;
  }

  return options;
}

function ensureCuratedSeedJson() {
  const seedPath = path.join(adminRoot, "data/tv-curated-hls-seeds.json");
  if (fs.existsSync(seedPath)) return;

  const result = spawnSync("npx", ["tsx", "scripts/extract-mobile-tv-seeds.ts"], {
    cwd: adminRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error("Failed to extract curated HLS seeds from mobile catalog.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { buildTvCandidatePool, prioritizeTvCandidates } = await import(
    "../lib/tvCandidatePool"
  );
  const { appendTvQuarantineRecord, readTvQuarantineCount } = await import(
    "../lib/tvQuarantineLog"
  );
  const {
    getTvHealthSummary,
    importVerifiedTvGrowthCandidates,
    probeTvStation,
    TV_GROWTH_TARGET_STATIONS,
    validatePublicTvUrl,
  } = await import("../lib/tvStationHealth");

  async function probeBatch(candidates: TvGrowthCandidate[], concurrency: number) {
    let verified = 0;
    let quarantined = 0;
    const verifiedCandidates: TvGrowthCandidate[] = [];

    for (let index = 0; index < candidates.length; index += concurrency) {
      const slice = candidates.slice(index, index + concurrency);
      const results = await Promise.all(
        slice.map(async (candidate) => {
          const urlCheck = validatePublicTvUrl(candidate.source_url);
          if (!urlCheck.ok) {
            appendTvQuarantineRecord({ candidate, reason: urlCheck.reason });
            return { candidate, playable: false };
          }

          const probe = await probeTvStation({
            id: "candidate",
            source_type: candidate.source_type,
            source_id: candidate.source_id,
            source_url: urlCheck.url,
            embed_url: candidate.embed_url || null,
            title: candidate.title,
            status: "approved",
            playback_status: "unchecked",
            is_active: false,
          });

          if (!probe.playable) {
            appendTvQuarantineRecord({ candidate, reason: probe.reason });
          }

          return { candidate, playable: probe.playable };
        })
      );

      for (const result of results) {
        if (result.playable) {
          verified += 1;
          verifiedCandidates.push(result.candidate);
        } else {
          quarantined += 1;
        }
      }
    }

    return { verified, quarantined, verifiedCandidates };
  }

  if (options.reportOnly) {
    const summary = await getTvHealthSummary();
    console.log(
      JSON.stringify(
        {
          mode: "report-only",
          summary,
          quarantineLogCount: readTvQuarantineCount(),
        },
        null,
        2
      )
    );
    return;
  }

  ensureCuratedSeedJson();

  const pool = await buildTvCandidatePool({
    iptvLimit: Math.max(400, TV_GROWTH_TARGET_STATIONS * 2),
  });

  if (options.probeOnly) {
    ensureCuratedSeedJson();
    const pool = await buildTvCandidatePool({
      iptvLimit: Math.max(400, TV_GROWTH_TARGET_STATIONS * 2),
    });
    const prioritized = prioritizeTvCandidates(
      pool.candidates,
      options.probeLimit > 0 ? options.probeLimit : pool.candidates.length
    );
    const probeResult = await probeBatch(prioritized, options.concurrency);
    const verifiedPath = path.join(adminRoot, "data/tv-verified-candidates.json");
    fs.mkdirSync(path.dirname(verifiedPath), { recursive: true });
    fs.writeFileSync(
      verifiedPath,
      `${JSON.stringify(probeResult.verifiedCandidates, null, 2)}\n`,
      "utf8"
    );

    console.log(
      JSON.stringify(
        {
          mode: "probe-only",
          pool: pool.report,
          probed: prioritized.length,
          verifiedByProbe: probeResult.verified,
          quarantinedByProbe: probeResult.quarantined,
          verifiedOutput: verifiedPath,
          quarantineLogCount: readTvQuarantineCount(),
          target: TV_GROWTH_TARGET_STATIONS,
        },
        null,
        2
      )
    );
    return;
  }

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          pool: pool.report,
          quarantineLogCount: readTvQuarantineCount(),
        },
        null,
        2
      )
    );
    return;
  }

  const summaryBefore = await getTvHealthSummary();
  const needed = Math.max(0, TV_GROWTH_TARGET_STATIONS - summaryBefore.publicVerified);
  const prioritized = prioritizeTvCandidates(
    pool.candidates,
    options.probeLimit > 0 ? options.probeLimit : Math.max(needed + 50, 120)
  );

  const probeResult = await probeBatch(prioritized, options.concurrency);
  let importResult = { found: 0, unique: 0, imported: 0, rejected: 0 };

  if (options.import && probeResult.verifiedCandidates.length > 0) {
    importResult = await importVerifiedTvGrowthCandidates(probeResult.verifiedCandidates);
  }

  const summaryAfter = await getTvHealthSummary();

  console.log(
    JSON.stringify(
      {
        mode: "import",
        pool: pool.report,
        neededBefore: needed,
        probed: prioritized.length,
        verifiedByProbe: probeResult.verified,
        quarantinedByProbe: probeResult.quarantined,
        importResult,
        summaryBefore,
        summaryAfter,
        quarantineLogCount: readTvQuarantineCount(),
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
