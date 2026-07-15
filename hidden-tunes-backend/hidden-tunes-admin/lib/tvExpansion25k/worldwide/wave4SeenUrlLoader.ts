import fs from "node:fs";
import path from "node:path";

import { TV_EXPANSION_CHECKPOINT_DIR } from "@/lib/tvExpansion25k/constants";
import { loadRejectedProbeUrls } from "@/lib/tvExpansion25k/worldwide/seenUrlLoader";

function normalizeUrl(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function collectJsonDir(adminRoot: string, relativeDir: string) {
  const seen = new Set<string>();
  const dir = path.join(adminRoot, relativeDir);
  if (!fs.existsSync(dir)) return seen;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    try {
      const rows = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Array<{ url?: string }>;
      for (const row of rows) {
        const url = normalizeUrl(row.url);
        if (url) seen.add(url);
      }
    } catch {
      // Skip corrupt partial files — do not fail the build.
    }
  }
  return seen;
}

function collectJsonFiles(adminRoot: string, relativePaths: string[]) {
  const seen = new Set<string>();
  for (const relativePath of relativePaths) {
    const filePath = path.join(adminRoot, relativePath);
    if (!fs.existsSync(filePath)) continue;
    try {
      const rows = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{ url?: string }>;
      for (const row of rows) {
        const url = normalizeUrl(row.url);
        if (url) seen.add(url);
      }
    } catch {
      // Skip corrupt files.
    }
  }
  return seen;
}

/** All URLs consumed by Waves 1–3 plus rejected probe fingerprints. */
export function loadWave4SeenUrls(adminRoot: string) {
  const seen = new Set<string>();

  for (const url of collectJsonFiles(adminRoot, [
    "lib/tvExpansion25k/sources/data/officialGlobalHls.json",
    "lib/tvExpansion25k/sources/data/governmentParliamentHls.json",
    "lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json",
  ])) {
    seen.add(url);
  }

  for (const url of collectJsonDir(adminRoot, "lib/tvExpansion25k/sources/data/worldwave")) {
    seen.add(url);
  }
  for (const url of collectJsonDir(adminRoot, "lib/tvExpansion25k/sources/data/worldwave3")) {
    seen.add(url);
  }
  for (const url of loadRejectedProbeUrls(adminRoot)) {
    seen.add(url);
  }

  const statePath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "state.json");
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        sources?: { adapterCursors?: Record<string, unknown> };
      };
      void state;
    } catch {
      // ignore
    }
  }

  return seen;
}

export function filterUnseenWave4Entries<T extends { url: string }>(entries: T[], seen: Set<string>) {
  const output: T[] = [];
  const batchSeen = new Set<string>();
  for (const entry of entries) {
    const url = normalizeUrl(entry.url);
    if (!url || seen.has(url) || batchSeen.has(url)) continue;
    batchSeen.add(url);
    output.push(entry);
  }
  return output;
}
