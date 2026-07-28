/**
 * Non-LibriVox Motivationals batch loop toward a public playable target.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

loadEnvFile(path.join(adminRoot, ".env.local"));

function readOption(name: string, fallback: string) {
  const equalsPrefix = `${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length) || fallback;
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const FAMILIES = [
  "title-audio-motivation",
  "licensed-audio-selfdev",
  "licensed-audio-growth",
  "licensed-audio-speeches",
  "licensed-movies-selfdev",
  "opensource-audio-licensed",
  "community-audio-licensed",
  "opensource-audio",
  "public-domain-speeches",
  "opensource",
  "prelinger",
];

async function main() {
  const target = Math.max(100, Number.parseInt(readOption("--target", "25000"), 10));
  const batchSize = Math.max(100, Number.parseInt(readOption("--batch-size", "150"), 10));
  const maxRounds = Math.max(1, Number.parseInt(readOption("--rounds", "20"), 10));
  const maxZero = Math.max(1, Number.parseInt(readOption("--max-zero", "2"), 10));

  const { runMotivationPlayableImport } = await import("../lib/motivationPlayableImport");
  const { runMotivationPostImportClassification } = await import("../lib/motivationPostImportJobs");
  const { runMotivationPromotionReview } = await import("../lib/motivationPromotion");
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");

  let status = await getMotivationStatusSummary();
  let publicCount = Number(status.publicVerified || 0);
  console.error(
    JSON.stringify({
      non_librivox_expand: true,
      phase: "start",
      target,
      public_playable: publicCount,
      remaining: Math.max(0, target - publicCount),
      families: FAMILIES,
    })
  );

  const zeroByFamily = new Map<string, number>();

  for (let round = 0; round < maxRounds && publicCount < target; round += 1) {
    for (const family of FAMILIES) {
      if (publicCount >= target) break;
      if ((zeroByFamily.get(family) || 0) >= maxZero) continue;

      console.error(
        JSON.stringify({
          non_librivox_expand: true,
          phase: "family_start",
          round: round + 1,
          family,
          public_playable: publicCount,
          remaining: Math.max(0, target - publicCount),
        })
      );

      let importReport;
      try {
        importReport = await runMotivationPlayableImport({
          queryFamily: family,
          sourceLimit: batchSize,
          insertBatchSize: Math.min(100, batchSize),
          probeConcurrency: 10,
          maxPages: Math.max(1, Math.ceil(batchSize / 80)),
          dryRun: false,
          resume: true,
          targetItems: target,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          JSON.stringify({
            non_librivox_expand: true,
            phase: "family_error",
            family,
            error: message,
          })
        );
        zeroByFamily.set(family, (zeroByFamily.get(family) || 0) + 1);
        continue;
      }

      const classify = await runMotivationPostImportClassification(
        Math.min(500, Number(importReport.pending_inserted || 0) + 80)
      );
      const promote = await runMotivationPromotionReview({
        apply: true,
        status: "pending",
        limit: Math.min(400, Number(importReport.pending_inserted || 0) + 80),
        preferAccepted: true,
      });

      status = await getMotivationStatusSummary();
      publicCount = Number(status.publicVerified || 0);

      const inserted = Number(importReport.pending_inserted || 0);
      const promoted = Number(promote.items_promoted || 0);
      if (inserted <= 0 && promoted <= 0) {
        zeroByFamily.set(family, (zeroByFamily.get(family) || 0) + 1);
      } else {
        zeroByFamily.set(family, 0);
      }

      console.error(
        JSON.stringify({
          non_librivox_expand: true,
          phase: "family_batch",
          round: round + 1,
          family,
          pending_inserted: inserted,
          promoted,
          classify_accepted: classify.accepted,
          public_playable: publicCount,
          remaining: Math.max(0, target - publicCount),
          candidates: importReport.candidates_discovered,
          duplicates: importReport.duplicates_skipped,
        })
      );

      if (publicCount >= target) break;
    }
  }

  status = await getMotivationStatusSummary();
  const payload = {
    ok: true,
    target,
    public_playable: status.publicVerified,
    remaining_to_target: Math.max(0, target - Number(status.publicVerified || 0)),
    target_reached: Number(status.publicVerified || 0) >= target,
    pending: status.pending,
  };
  fs.mkdirSync(path.join(adminRoot, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(adminRoot, "data", "motivationals-non-librivox-expand-report.json"),
    JSON.stringify(payload, null, 2)
  );
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
