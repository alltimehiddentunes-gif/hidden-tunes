import fs from "node:fs";
import path from "node:path";

import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

const QUARANTINE_PATH = path.resolve(process.cwd(), "data/tv-quarantine.jsonl");

export function appendTvQuarantineRecord(record: {
  candidate: Pick<TvGrowthCandidate, "source_key" | "title" | "source_url" | "source_type">;
  reason: string;
  at?: string;
}) {
  fs.mkdirSync(path.dirname(QUARANTINE_PATH), { recursive: true });
  fs.appendFileSync(
    QUARANTINE_PATH,
    `${JSON.stringify({
      at: record.at || new Date().toISOString(),
      source_key: record.candidate.source_key,
      title: record.candidate.title,
      source_type: record.candidate.source_type,
      source_url: record.candidate.source_url,
      reason: record.reason,
    })}\n`,
    "utf8"
  );
}

export function readTvQuarantineCount() {
  if (!fs.existsSync(QUARANTINE_PATH)) return 0;
  return fs
    .readFileSync(QUARANTINE_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}
