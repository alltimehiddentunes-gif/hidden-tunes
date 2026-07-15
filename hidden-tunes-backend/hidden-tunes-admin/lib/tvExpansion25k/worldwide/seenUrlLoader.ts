import fs from "node:fs";
import path from "node:path";

import { TV_EXPANSION_CHECKPOINT_DIR } from "@/lib/tvExpansion25k/constants";
import { parseM3uPlaylist } from "@/lib/tvExpansion25k/sources/shared/m3uParser";
import { retryFetchText } from "@/lib/tvExpansion25k/sources/shared/retryFetch";

const FREE_TV_MASTER =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

function normalizeUrl(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function urlFromFingerprint(fingerprint: string) {
  const parts = fingerprint.split("::");
  return parts.length >= 2 ? normalizeUrl(parts[1]) : "";
}

function collectJsonUrls(adminRoot: string, relativePaths: string[]) {
  const seen = new Set<string>();
  for (const relativePath of relativePaths) {
    const filePath = path.join(adminRoot, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const rows = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{ url?: string }>;
    for (const row of rows) {
      const url = normalizeUrl(row.url);
      if (url) seen.add(url);
    }
  }
  return seen;
}

export function loadRejectedProbeUrls(adminRoot: string) {
  const filePath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "rejected-fingerprints.json");
  if (!fs.existsSync(filePath)) return new Set<string>();
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8")) as string[];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = urlFromFingerprint(row);
    if (url) seen.add(url);
  }
  return seen;
}

export async function loadExpansionSeenUrls(adminRoot: string) {
  const seen = collectJsonUrls(adminRoot, [
    "lib/tvExpansion25k/sources/data/officialGlobalHls.json",
    "lib/tvExpansion25k/sources/data/governmentParliamentHls.json",
    "lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json",
  ]);

  for (const url of loadRejectedProbeUrls(adminRoot)) {
    seen.add(url);
  }

  try {
    const masterText = await retryFetchText(FREE_TV_MASTER, {
      headers: { Accept: "application/vnd.apple.mpegurl,text/plain" },
    });
    for (const entry of parseM3uPlaylist(masterText)) {
      const url = normalizeUrl(entry.url);
      if (url) seen.add(url);
    }
  } catch {
    // Offline build can still proceed with local filters.
  }

  return seen;
}

export function filterUnseenByUrl<T extends { url: string }>(entries: T[], seen: Set<string>) {
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
