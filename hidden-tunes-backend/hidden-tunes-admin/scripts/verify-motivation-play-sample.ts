import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { MotivationGrowthCandidate } from "../lib/motivationHealth";
import { probeMotivationItem } from "../lib/motivationHealth";
import { validatePublicTvUrl } from "../lib/tvStationHealth";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const defaultInput = path.join(adminRoot, "data/motivation-verified.json");

async function main() {
  const input = process.argv[2]
    ? path.resolve(process.argv[2])
    : defaultInput;
  const sampleSize = Number(process.argv[3] || 50);

  if (!fs.existsSync(input)) {
    throw new Error(`Verified motivation file not found: ${input}`);
  }

  const verified = JSON.parse(
    fs.readFileSync(input, "utf8")
  ) as MotivationGrowthCandidate[];
  const sample = verified.slice(0, sampleSize);
  const checks: Array<Record<string, unknown>> = [];

  for (const candidate of sample) {
    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) {
      checks.push({ title: candidate.title, ok: false, reason: urlCheck.reason });
      continue;
    }

    const probe = await probeMotivationItem({
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: candidate.embed_url || null,
    });

    checks.push({
      title: candidate.title,
      source_type: candidate.source_type,
      ok: probe.playable,
      reason: probe.reason,
    });
  }

  const passed = checks.filter((entry) => entry.ok).length;

  console.log(
    JSON.stringify(
      {
        ok: true,
        sampleSize: sample.length,
        playChecksPassed: passed,
        playChecksFailed: sample.length - passed,
        checks,
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
