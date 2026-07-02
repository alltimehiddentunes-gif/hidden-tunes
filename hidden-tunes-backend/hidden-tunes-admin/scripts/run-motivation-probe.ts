import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { MotivationGrowthCandidate } from "../lib/motivationHealth";
import { probeMotivationItem } from "../lib/motivationHealth";
import { validatePublicTvUrl } from "../lib/tvStationHealth";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const defaultInput = path.join(adminRoot, "data/motivation-candidates.json");
const verifiedOutput = path.join(adminRoot, "data/motivation-verified.json");
const quarantineOutput = path.join(adminRoot, "data/motivation-quarantine.jsonl");

function parseArgs(argv: string[]) {
  const inputIndex = argv.findIndex((arg) => !arg.startsWith("-"));
  const limitIndex = argv.indexOf("--limit");
  const concurrencyIndex = argv.indexOf("--concurrency");
  return {
    input: inputIndex >= 0 ? path.resolve(argv[inputIndex]) : defaultInput,
    limit: limitIndex >= 0 ? Number(argv[limitIndex + 1] || 0) : 0,
    concurrency: concurrencyIndex >= 0 ? Math.max(1, Number(argv[concurrencyIndex + 1] || 6)) : 6,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.input)) {
    throw new Error(`Candidate file not found: ${options.input}`);
  }

  const candidates = JSON.parse(fs.readFileSync(options.input, "utf8")) as MotivationGrowthCandidate[];
  const slice = options.limit > 0 ? candidates.slice(0, options.limit) : candidates;

  let verified = 0;
  let quarantined = 0;
  const verifiedCandidates: MotivationGrowthCandidate[] = [];

  fs.mkdirSync(path.dirname(quarantineOutput), { recursive: true });
  if (fs.existsSync(quarantineOutput)) fs.unlinkSync(quarantineOutput);

  for (let index = 0; index < slice.length; index += options.concurrency) {
    const batch = slice.slice(index, index + options.concurrency);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const urlCheck = validatePublicTvUrl(candidate.source_url);
        if (!urlCheck.ok) {
          return { candidate, playable: false, reason: urlCheck.reason };
        }

        const probe = await probeMotivationItem({
          source_type: candidate.source_type,
          source_id: candidate.source_id,
          source_url: urlCheck.url,
          embed_url: candidate.embed_url || null,
        });

        return { candidate, playable: probe.playable, reason: probe.reason };
      })
    );

    for (const result of results) {
      if (result.playable) {
        verified += 1;
        verifiedCandidates.push(result.candidate);
      } else {
        quarantined += 1;
        fs.appendFileSync(
          quarantineOutput,
          `${JSON.stringify({
            at: new Date().toISOString(),
            title: result.candidate.title,
            source_key: result.candidate.source_key,
            source_url: result.candidate.source_url,
            reason: result.reason,
          })}\n`,
          "utf8"
        );
      }
    }
  }

  fs.writeFileSync(verifiedOutput, `${JSON.stringify(verifiedCandidates, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        mode: "probe-only",
        input: options.input,
        probed: slice.length,
        verified,
        quarantined,
        verifiedOutput,
        quarantineOutput,
        target: 5000,
        gapToTarget: Math.max(0, 5000 - verified),
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
