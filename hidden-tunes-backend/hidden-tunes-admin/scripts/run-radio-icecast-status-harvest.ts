/**
 * Deep harvest: public Icecast status pages on hosts already in catalog.
 * Discovers sibling mounts intentionally published by the same broadcaster server.
 * Approved source family: icecast_yp / broadcaster_published_playlists.
 *
 *   npx tsx scripts/run-radio-icecast-status-harvest.ts --execute --limit 800
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
const RESULT_PATH = path.join(adminRoot, "data", "radio-icecast-status-harvest-result.json");
const USER_AGENT = "HiddenTunes/1.0 radio-icecast-status-harvest";

function readArgs() {
  return {
    execute: process.argv.includes("--execute"),
    limit: Number(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit") + 1] : 800),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 900),
  };
}

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

type IcecastMount = {
  name: string;
  listenurl: string;
  genre?: string;
  server_type?: string;
};

function parseStatusJson(payload: unknown, baseOrigin: string): IcecastMount[] {
  const root = payload as { icestats?: { source?: unknown } };
  const source = root?.icestats?.source;
  if (!source) return [];
  const rows = Array.isArray(source) ? source : [source];
  const mounts: IcecastMount[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const listen =
      String(item.listenurl || item.listen_url || item.server_url || "").trim() ||
      (item.mount ? `${baseOrigin}${String(item.mount)}` : "");
    if (!listen) continue;
    const check = isRejectedPlaylistUrl(listen);
    if (check.rejected) continue;
    const name =
      cleanRadioText(String(item.server_name || item.title || item.mount || "Icecast Stream"), 300) ||
      "Icecast Stream";
    mounts.push({
      name,
      listenurl: listen,
      genre: item.genre ? String(item.genre) : undefined,
      server_type: item.server_type ? String(item.server_type) : undefined,
    });
  }
  return mounts;
}

function parseStatusHtml(html: string, baseOrigin: string): IcecastMount[] {
  const mounts: IcecastMount[] = [];
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const raw of hrefs) {
    if (!/\/(stream|live|radio|mount|mp3|aac|ogg|opus)/i.test(raw) && !/:8000|:8443|:8080/i.test(raw)) {
      if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) continue;
    }
    try {
      const absolute = new URL(raw, baseOrigin).toString();
      if (/\.(css|js|png|jpg|svg|ico)(\?|$)/i.test(absolute)) continue;
      if (/status\.xsl|status-json|style\.xsl|auth\.xsl/i.test(absolute)) continue;
      const check = isRejectedPlaylistUrl(absolute);
      if (check.rejected) continue;
      const pathName = new URL(absolute).pathname.replace(/\/+$/, "") || "/";
      if (pathName === "/" || pathName === "") continue;
      mounts.push({
        name: cleanRadioText(pathName.replace(/^\//, ""), 300) || "Icecast Stream",
        listenurl: absolute,
      });
    } catch {
      // ignore
    }
  }
  return mounts.slice(0, 40);
}

async function fetchMounts(origin: string): Promise<IcecastMount[]> {
  const paths = ["/status-json.xsl", "/status.xsl", "/"];
  for (const p of paths) {
    try {
      const response = await fetch(`${origin}${p}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json,text/html,*/*" },
        redirect: "follow",
      });
      if (!response.ok) continue;
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const text = await response.text();
      if (contentType.includes("json") || text.trim().startsWith("{")) {
        try {
          const mounts = parseStatusJson(JSON.parse(text), origin);
          if (mounts.length) return mounts;
        } catch {
          // fall through
        }
      }
      if (text.includes("Icecast") || text.includes("mount") || text.includes("listenurl")) {
        const mounts = parseStatusHtml(text, origin);
        if (mounts.length) return mounts;
      }
    } catch {
      // try next path
    }
  }
  return [];
}

function toNormalized(
  name: string,
  streamUrl: string,
  homepage: string | null,
  tags: string[],
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
      country_code: null,
      normalized_homepage_host: host,
    }),
    fingerprint_version: 1,
    source_name: "icecast_yp",
    source_type: "icecast_yp",
    source_uuid: sourceId,
    source_station_id: sourceId,
    source_station_uuid: sourceId,
    source_server: "icecast_status",
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: homepageUrl,
    normalized_homepage_host: host,
    favicon_url: null,
    country: null,
    country_code: null,
    state: null,
    language: null,
    tags: tags.length ? tags : ["icecast"],
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

  console.log(JSON.stringify({ icecast_harvest: "loading_stream_hosts", limit: options.limit }));

  const hosts = new Map<string, string>();
  let from = 0;
  while (hosts.size < options.limit * 3 && from < 60_000) {
    const { data, error } = await supabase
      .from("radio_stations")
      .select("stream_url,homepage_url")
      .eq("is_mature", false)
      .not("stream_url", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      try {
        const stream = new URL(String(row.stream_url));
        if (!["http:", "https:"].includes(stream.protocol)) continue;
        if (isPrivateHost(stream.hostname)) continue;
        const origin = `${stream.protocol}//${stream.host}`;
        if (!hosts.has(origin)) {
          hosts.set(origin, row.homepage_url ? String(row.homepage_url) : origin);
        }
      } catch {
        // skip
      }
    }
    from += 1000;
    if (data.length < 1000) break;
  }

  const selected = [...hosts.entries()].slice(0, options.limit);
  console.log(JSON.stringify({ icecast_harvest: "hosts_selected", hosts: selected.length }));

  // Session-local dedupe only — full catalog index load is too slow at 45k+ rows.
  // insertNewRadioStationOnly still enforces DB-level duplicate checks.
  console.log(JSON.stringify({ icecast_harvest: "using_session_dedupe" }));
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
    hosts: 0,
    status_ok: 0,
    mounts_found: 0,
    inserted: 0,
    duplicates: 0,
    invalid: 0,
    failed: 0,
    mature_excluded: 0,
  };

  for (const [origin, homepage] of selected) {
    stats.hosts += 1;
    await sleep(options.delayMs);
    try {
      const mounts = await fetchMounts(origin);
      if (!mounts.length) continue;
      stats.status_ok += 1;
      stats.mounts_found += mounts.length;
      for (const mount of mounts) {
        const sourceId = `ice_${hashId(mount.listenurl)}`;
        const tags = ["icecast"];
        if (mount.genre) tags.push(...String(mount.genre).split(/[,/|]/).map((t) => t.trim()).filter(Boolean).slice(0, 5));
        const normalized = toNormalized(mount.name, mount.listenurl, homepage, tags, sourceId);
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
    } catch {
      // skip host
    }
    if (stats.hosts % 20 === 0) {
      console.log(JSON.stringify({ icecast_harvest_progress: { ...stats } }));
    }
  }

  fs.writeFileSync(RESULT_PATH, JSON.stringify({ ...stats, mode: options.execute ? "execute" : "dry-run" }, null, 2));
  console.log(JSON.stringify({ ...stats, mode: options.execute ? "execute" : "dry-run" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
