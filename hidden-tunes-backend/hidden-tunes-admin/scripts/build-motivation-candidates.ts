import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildArchiveMotivationCandidates } from "../lib/motivationArchiveSource";
import { youtubeStarterRowsToCandidates } from "../lib/tvYoutubeStarterBridge";
import type { MotivationGrowthCandidate } from "../lib/motivationHealth";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const defaultOutput = path.join(adminRoot, "data/motivation-candidates.json");

function parseArgs(argv: string[]) {
  const targetIndex = argv.indexOf("--target");
  const outputIndex = argv.indexOf("--output");
  return {
    target: targetIndex >= 0 ? Number(argv[targetIndex + 1] || 6000) : 6000,
    output: outputIndex >= 0 ? path.resolve(argv[outputIndex + 1]) : defaultOutput,
    includeYoutubeStarter: !argv.includes("--archive-only"),
  };
}

function mapYoutubeToMotivation(
  rows: ReturnType<typeof youtubeStarterRowsToCandidates>
): MotivationGrowthCandidate[] {
  return rows.map((row) => ({
    source_type: row.source_type,
    source_id: row.source_id,
    source_url: row.source_url,
    embed_url: row.embed_url || null,
    title: row.title,
    description: row.description || null,
    thumbnail_url: row.thumbnail_url || null,
    channel_name: row.channel_name || null,
    category: "Motivation",
    subcategory: row.format?.includes("Live") ? "Motivational speeches" : "Mindset",
    tags: ["Motivation", ...(row.tags || [])],
    language: row.language || "English",
    region: row.region || row.country || null,
    source_key: `youtube-motivation:${row.source_id}`,
    is_featured: row.is_featured,
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const merged: MotivationGrowthCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: MotivationGrowthCandidate) => {
    const key = candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(candidate);
  };

  if (options.includeYoutubeStarter) {
    for (const candidate of mapYoutubeToMotivation(youtubeStarterRowsToCandidates())) {
      push(candidate);
    }
  }

  const archiveTarget = Math.max(0, options.target - merged.length);
  if (archiveTarget > 0) {
    const archiveCandidates = await buildArchiveMotivationCandidates({
      target: archiveTarget,
    });
    for (const candidate of archiveCandidates) push(candidate);
  }

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: options.output,
        totalCandidates: merged.length,
        target: options.target,
        archiveSourced: merged.filter((row) => row.source_type === "archive_video").length,
        youtubeSourced: merged.filter((row) => row.source_type === "youtube_video").length,
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
