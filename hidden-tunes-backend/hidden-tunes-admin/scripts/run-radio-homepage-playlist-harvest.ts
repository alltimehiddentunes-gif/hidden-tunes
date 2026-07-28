/**
 * Deep harvest: pull intentionally published .m3u/.pls/.xspf links from
 * homepage_url of stations already in catalog (broadcaster_published_playlists).
 *
 *   npx tsx scripts/run-radio-homepage-playlist-harvest.ts --execute --limit 2000
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { isCatalogDuplicate } from "@/lib/radioExpansion25k/catalogDedupeIndex";
import { insertNewRadioStationOnly } from "@/lib/radioExpansion25k/insertOnlyImport";
import { isMatureRadioCandidate, sleep } from "@/lib/radioExpansion25k/radioBrowserFetch";
import { isRejectedPlaylistUrl } from "@/lib/radioExpansion25k/sourceRegistry";
import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioName,
  normalizeRadioUrl,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";

const adminRoot = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(adminRoot, "data", "radio-homepage-playlist-harvest-result.json");
const USER_AGENT = "HiddenTunes/1.0 radio-homepage-playlist-harvest";

function readArgs() {
  return {
    execute: process.argv.includes("--execute"),
    limit: Number(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit") + 1] : 2000),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 1000),
  };
}

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function extractPlaylistUrls(html: string, baseUrl: string) {
  const found = new Set<string>();
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const naked = [...html.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map((m) => m[0]);
  for (const raw of [...hrefs, ...naked]) {
    if (!/\.(m3u8?|pls|xspf)(\?|$)/i.test(raw) && !/listen\.(m3u|pls)/i.test(raw)) continue;
    try {
      const absolute = new URL(raw, baseUrl).toString();
      const check = isRejectedPlaylistUrl(absolute);
      if (check.rejected) continue;
      found.add(absolute);
    } catch {
      // ignore
    }
  }
  return [...found].slice(0, 20);
}

async function resolvePlaylistStreams(playlistUrl: string) {
  const response = await fetch(playlistUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    redirect: "follow",
  });
  if (!response.ok) return [] as string[];
  const text = await response.text();
  const streams: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const pls = trimmed.match(/^File\d+=(.+)$/i);
    const candidate = pls ? pls[1].trim() : trimmed;
    if (!/^https?:\/\//i.test(candidate)) continue;
    const check = isRejectedPlaylistUrl(candidate);
    if (check.rejected) continue;
    streams.push(candidate);
    if (streams.length >= 5) break;
  }
  return streams;
}

function toNormalized(
  name: string,
  streamUrl: string,
  homepage: string | null,
  countryCode: string | null,
  sourceId: string
): NormalizedRadioStation | null {
  const sourceStreamUrl = normalizeRadioUrl(streamUrl, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;
  const homepageUrl = homepage ? normalizeRadioUrl(homepage) || null : null;
  const host = getHomepageHost(homepageUrl);
  const now = new Date().toISOString();
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: countryCode,
      normalized_homepage_host: host,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceId,
    source_station_id: sourceId,
    source_station_uuid: sourceId,
    source_server: "broadcaster_published_playlists",
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: homepageUrl,
    normalized_homepage_host: host,
    favicon_url: null,
    country: null,
    country_code: countryCode,
    state: null,
    language: null,
    tags: ["broadcaster-playlist"],
    bitrate: null,
    codec: null,
    votes: null,
    click_count: null,
    category_slug: "global",
    categories: ["global"],
    source_payload_hash: hashId(sourceStreamUrl),
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  console.log(JSON.stringify({ harvest: "loading_homepages", limit: options.limit }));
  const { data, error } = await supabase
    .from("radio_stations")
    .select("id,name,homepage_url,country_code")
    .eq("is_mature", false)
    .not("homepage_url", "is", null)
    .order("reliability_score", { ascending: false })
    .limit(options.limit);
  if (error) throw error;

  console.log(JSON.stringify({ harvest: "ready", homepages: (data || []).length }));
  // Session-local dedupe; DB insert path still blocks true duplicates.
  const catalogIndex = {
    sourceKeys: new Set<string>(),
    streams: new Set<string>(),
    fingerprints: new Set<string>(),
    legacyUuids: new Set<string>(),
    loaded_at: new Date().toISOString(),
    source_key_count: 0,
    stream_count: 0,
    fingerprint_count: 0,
    legacy_uuid_count: 0,
  };
  const stats = {
    homepages: 0,
    playlists_found: 0,
    streams_found: 0,
    inserted: 0,
    duplicates: 0,
    invalid: 0,
    failed: 0,
    mature_excluded: 0,
  };

  for (const row of data || []) {
    const homepage = String(row.homepage_url || "").trim();
    if (!/^https?:\/\//i.test(homepage)) continue;
    stats.homepages += 1;
    await sleep(options.delayMs);
    try {
      const response = await fetch(homepage, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
      });
      if (!response.ok) continue;
      const html = await response.text();
      const playlists = extractPlaylistUrls(html, homepage);
      stats.playlists_found += playlists.length;
      for (const playlist of playlists) {
        await sleep(Math.min(options.delayMs, 800));
        const streams = await resolvePlaylistStreams(playlist);
        stats.streams_found += streams.length;
        for (const stream of streams) {
          const sourceId = `bpl_${hashId(stream)}`;
          const normalized = toNormalized(
            `${row.name} Live`,
            stream,
            homepage,
            row.country_code ? String(row.country_code) : null,
            sourceId
          );
          if (!normalized) {
            stats.invalid += 1;
            continue;
          }
          if (isMatureRadioCandidate(normalized)) {
            stats.mature_excluded += 1;
            continue;
          }
          if (isCatalogDuplicate(normalized, catalogIndex)) {
            stats.duplicates += 1;
            continue;
          }
          if (!options.execute) {
            stats.inserted += 1;
            continue;
          }
          const result = await insertNewRadioStationOnly(supabase, normalized, { dryRun: false });
          if (result.outcome === "inserted") {
            stats.inserted += 1;
            catalogIndex.sourceKeys.add(`${normalized.source_name}:${normalized.source_station_id}`);
            catalogIndex.streams.add(normalized.normalized_stream_url);
            catalogIndex.fingerprints.add(normalized.station_fingerprint);
          } else if (result.outcome === "duplicate") {
            stats.duplicates += 1;
          } else {
            stats.failed += 1;
          }
        }
      }
      if (stats.homepages % 25 === 0) {
        console.log(JSON.stringify({ harvest_progress: { ...stats } }));
      }
    } catch {
      // skip unreachable homepages
    }
  }

  fs.writeFileSync(RESULT_PATH, JSON.stringify({ ...stats, mode: options.execute ? "execute" : "dry-run" }, null, 2));
  console.log(JSON.stringify({ ...stats, mode: options.execute ? "execute" : "dry-run" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
