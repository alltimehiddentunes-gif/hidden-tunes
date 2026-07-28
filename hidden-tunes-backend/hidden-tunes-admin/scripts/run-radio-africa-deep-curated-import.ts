/**
 * Continent-wide Africa curated deep import.
 * Pulls checked country M3Us, verifies through existing probe, imports playable unique stations.
 *
 *   npx tsx scripts/run-radio-africa-deep-curated-import.ts --execute
 *   npx tsx scripts/run-radio-africa-deep-curated-import.ts --execute --max-countries 10
 *   npx tsx scripts/run-radio-africa-deep-curated-import.ts --execute --only KE,TZ,RW
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  AFRICA_RADIO_QUEUE,
  getAfricanCountry,
  type AfricanCountry,
} from "@/lib/radioAfricaExpansion/africanCountries";
import {
  getQueueEntry,
  loadAfricaRadioQueue,
  saveAfricaRadioQueue,
} from "@/lib/radioAfricaExpansion/queue";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  findExistingRadioStationId,
  insertNewRadioStationOnly,
} from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchRadioBrowserJson,
  sleep,
} from "@/lib/radioExpansion25k/radioBrowserFetch";
import {
  isCatalogDuplicate,
  loadCatalogDedupeIndex,
  type CatalogDedupeIndex,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioBrowserStationForImport,
  normalizeRadioName,
  normalizeRadioUrl,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");
const USER_AGENT = "HiddenTunes/1.0 africa-deep-curated";
const M3U_BASE =
  "https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/listen_fm/checked";

/** Map ISO → remote M3U filename(s). */
const COUNTRY_M3U_FILES: Record<string, string[]> = {
  DZ: ["Algeria.m3u"],
  AO: ["Angola.m3u"],
  BJ: ["Benin.m3u"],
  BW: ["Botswana.m3u"],
  BF: ["Burkina Faso.m3u"],
  BI: ["Burundi.m3u"],
  CM: ["Cameroon.m3u"],
  CV: ["Cape Verde.m3u"],
  CF: ["Central African Republic.m3u"],
  TD: ["Chad.m3u"],
  KM: ["Comoros.m3u"],
  CG: ["Congo.m3u"],
  CD: ["DR Congo.m3u", "Congo.m3u"],
  CI: ["Ivory Coast.m3u"],
  DJ: ["Djibouti.m3u"],
  EG: ["Egypt.m3u"],
  GQ: ["Equatorial Guinea.m3u"],
  ER: ["Eritrea.m3u"],
  SZ: ["Swaziland.m3u", "Eswatini.m3u"],
  ET: ["Ethiopia.m3u"],
  GA: ["Gabon.m3u"],
  GM: ["Gambia.m3u"],
  GH: ["Ghana.m3u"],
  GN: ["Guinea.m3u"],
  GW: ["Guinea-Bissau.m3u", "Guinea Bissau.m3u"],
  KE: ["Kenya.m3u"],
  LS: ["Lesotho.m3u"],
  LR: ["Liberia.m3u"],
  LY: ["Libya.m3u"],
  MG: ["Madagascar.m3u"],
  MW: ["Malawi.m3u"],
  ML: ["Mali.m3u"],
  MR: ["Mauritania.m3u"],
  MU: ["Mauritius.m3u"],
  MA: ["Morocco.m3u"],
  MZ: ["Mozambique.m3u"],
  NA: ["Namibia.m3u"],
  NE: ["Niger.m3u"],
  NG: ["Nigeria.m3u"],
  RW: ["Rwanda.m3u"],
  ST: ["Sao Tome.m3u", "Sao Tome and Principe.m3u"],
  SN: ["Senegal.m3u"],
  SC: ["Seychelles.m3u"],
  SL: ["Sierra Leone.m3u"],
  SO: ["Somalia.m3u"],
  ZA: ["South Africa.m3u"],
  SS: ["South Sudan.m3u"],
  SD: ["Sudan.m3u"],
  TZ: ["Tanzania.m3u"],
  TG: ["Togo.m3u"],
  TN: ["Tunisia.m3u"],
  UG: ["Uganda.m3u"],
  EH: ["Western Sahara.m3u"],
  ZM: ["Zambia.m3u"],
  ZW: ["Zimbabwe.m3u"],
};

type PlaylistEntry = { name: string; streamUrl: string };

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const maxIndex = process.argv.indexOf("--max-countries");
  const onlyIndex = process.argv.indexOf("--only");
  const only =
    onlyIndex >= 0
      ? String(process.argv[onlyIndex + 1] || "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : null;
  return {
    execute: args.has("--execute"),
    skipRb: args.has("--skip-rb"),
    skipM3u: args.has("--skip-m3u"),
    maxCountries:
      maxIndex >= 0
        ? Number(process.argv[maxIndex + 1])
        : Number(process.env.AFRICA_DEEP_MAX || 54),
    only,
    concurrency: Number(process.env.AFRICA_CONCURRENCY || 3),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 400),
  };
}

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function isRejectedUrl(url: string) {
  if (/[?&]k=\d{8,}/i.test(url) && /openstream\.co/i.test(url)) return "short_lived_signed_url";
  if (/halo\.streamerr\.co\/listen\/italiavera/i.test(url)) return "wrong_country_antenna_web";
  if (/eagles1023fmabuja|lounge877fmlagos/i.test(url)) return "wrong_country_feed";
  return null;
}

function parseM3u(text: string): PlaylistEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: PlaylistEntry[] = [];
  let pendingName: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      const comma = line.indexOf(",");
      pendingName = comma >= 0 ? line.slice(comma + 1).trim() : "Radio Station";
      continue;
    }
    if (line.startsWith("#")) continue;
    if (/^https?:\/\//i.test(line) && pendingName) {
      entries.push({ name: pendingName, streamUrl: line });
      pendingName = null;
    }
  }
  return entries;
}

async function fetchM3uForCountry(code: string): Promise<{ file: string; entries: PlaylistEntry[] } | null> {
  const files = COUNTRY_M3U_FILES[code] || [];
  for (const file of files) {
    const encoded = file
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const url = `${M3U_BASE}/${encoded}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "audio/x-mpegurl,*/*" },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes("#EXT")) continue;
      return { file, entries: parseM3u(text) };
    } catch {
      // try next filename
    }
  }
  return null;
}

function buildCandidate(
  entry: PlaylistEntry,
  country: AfricanCountry,
  attribution: string
): NormalizedRadioStation | null {
  if (isRejectedUrl(entry.streamUrl)) return null;
  const sourceStreamUrl = normalizeRadioUrl(entry.streamUrl, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(entry.name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;
  const now = new Date().toISOString();
  const sourceStationId = `curated_${country.code.toLowerCase()}_${hashId(normalizedStreamUrl)}`;
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: country.code,
      normalized_homepage_host: null,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceStationId,
    source_station_id: sourceStationId,
    source_station_uuid: sourceStationId,
    source_server: `hidden_tunes_trusted_catalog:${attribution}`,
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: null,
    normalized_homepage_host: getHomepageHost(null),
    favicon_url: null,
    country: country.name,
    country_code: country.code,
    state: null,
    language: null,
    tags: [country.name.toLowerCase(), "curated", "africa"],
    bitrate: null,
    codec: null,
    votes: null,
    click_count: null,
    category_slug: "global",
    categories: ["global"],
    source_payload_hash: hashId(`${cleanedName}|${normalizedStreamUrl}`),
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}

async function publicCount(supabase: SupabaseClient, code: string) {
  const { count, error } = await supabase
    .from("radio_stations")
    .select("id", { count: "exact", head: true })
    .eq("country_code", code)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("is_mature", false)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD);
  if (error) throw error;
  return count || 0;
}

async function importPlayableCandidate(
  supabase: SupabaseClient,
  candidate: NormalizedRadioStation,
  execute: boolean
) {
  const probe = await probeRadioStream(candidate.stream_url, {
    timeoutMs: 12_000,
    maxRedirects: 5,
    maxPlaylistBytes: 128 * 1024,
    maxReadBytes: 24 * 1024,
  });
  if (!probe.playable) {
    return { outcome: "probe_failed" as const, reason: probe.outcome };
  }

  const existing = await findExistingRadioStationId(supabase, candidate);
  if (existing) {
    if (execute) {
      const { data: row } = await supabase
        .from("radio_stations")
        .select(
          "id,reliability_score,consecutive_failures,playback_status,quarantined_at,disabled_at,is_verified"
        )
        .eq("id", existing.id)
        .maybeSingle();
      if (row) {
        const update = applyRadioVerificationProbe(row as never, probe);
        await supabase
          .from("radio_stations")
          .update({
            ...update,
            delivery_mode: candidate.stream_url.startsWith("https://")
              ? "direct_https"
              : "backend_relay",
            resolved_stream_url: probe.finalUrl || candidate.stream_url,
          })
          .eq("id", existing.id);
      }
    }
    return { outcome: "duplicate" as const, id: existing.id };
  }

  if (!execute) return { outcome: "dry_run_would_insert" as const };

  const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
  if (inserted.outcome !== "inserted" || !inserted.stationId) {
    return { outcome: "insert_failed" as const, error: inserted.error };
  }
  const update = applyRadioVerificationProbe(
    { id: inserted.stationId, reliability_score: 0, consecutive_failures: 0 } as never,
    probe
  );
  await supabase
    .from("radio_stations")
    .update({
      ...update,
      delivery_mode: candidate.stream_url.startsWith("https://") ? "direct_https" : "backend_relay",
      resolved_stream_url: probe.finalUrl || candidate.stream_url,
    })
    .eq("id", inserted.stationId);
  return { outcome: "imported" as const, id: inserted.stationId };
}

async function discoverRbFresh(
  country: AfricanCountry,
  catalog: CatalogDedupeIndex
) {
  const fresh: NormalizedRadioStation[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    let stations: Awaited<ReturnType<typeof fetchRadioBrowserJson>>["stations"] = [];
    let server = "";
    try {
      const fetched = await fetchRadioBrowserJson(
        `/json/stations/bycountrycodeexact/${country.code}?hidebroken=false&limit=100&offset=${offset}&order=votes&reverse=true`,
        { timeoutMs: 15000, userAgent: USER_AGENT, maxRetries: 3 }
      );
      stations = fetched.stations;
      server = fetched.server;
    } catch {
      break;
    }
    if (!stations.length) break;
    for (const raw of stations) {
      const normalized = normalizeRadioBrowserStationForImport(raw, "global", {
        now: new Date().toISOString(),
        sourceServer: server,
      });
      if (!normalized) continue;
      if (normalized.country_code && normalized.country_code !== country.code) continue;
      if (!normalized.country_code) {
        normalized.country_code = country.code;
        normalized.country = country.name;
      }
      if (isCatalogDuplicate(normalized, catalog)) continue;
      const key = `${normalized.source_name}:${normalized.source_station_id}`;
      catalog.sourceKeys.add(key);
      catalog.streams.add(normalized.normalized_stream_url);
      catalog.fingerprints.add(normalized.station_fingerprint);
      fresh.push(normalized);
    }
    if (stations.length < 100) break;
    offset += 100;
    await sleep(750);
  }
  return fresh;
}

async function processCountry(
  supabase: SupabaseClient,
  country: AfricanCountry,
  catalog: CatalogDedupeIndex,
  options: ReturnType<typeof readArgs>
) {
  const before = await publicCount(supabase, country.code);
  const stats = {
    code: country.code,
    country: country.name,
    before,
    m3u_file: null as string | null,
    m3u_entries: 0,
    rb_fresh: 0,
    imported: 0,
    duplicates: 0,
    probe_failed: 0,
    rejected_url: 0,
    dry_run: 0,
    after: before,
  };
  const results: unknown[] = [];

  if (!options.skipM3u) {
    const m3u = await fetchM3uForCountry(country.code);
    if (m3u) {
      stats.m3u_file = m3u.file;
      stats.m3u_entries = m3u.entries.length;
      for (const entry of m3u.entries) {
        const reject = isRejectedUrl(entry.streamUrl);
        if (reject) {
          stats.rejected_url += 1;
          results.push({ name: entry.name, outcome: "rejected_url", reason: reject });
          continue;
        }
        const candidate = buildCandidate(entry, country, `junguler-m3u:${m3u.file}`);
        if (!candidate) {
          stats.rejected_url += 1;
          continue;
        }
        if (isCatalogDuplicate(candidate, catalog)) {
          stats.duplicates += 1;
          continue;
        }
        const outcome = await importPlayableCandidate(supabase, candidate, options.execute);
        if (outcome.outcome === "imported" || outcome.outcome === "dry_run_would_insert") {
          if (outcome.outcome === "imported") stats.imported += 1;
          else stats.dry_run += 1;
          catalog.sourceKeys.add(`${candidate.source_name}:${candidate.source_station_id}`);
          catalog.streams.add(candidate.normalized_stream_url);
          catalog.fingerprints.add(candidate.station_fingerprint);
        } else if (outcome.outcome === "duplicate") {
          stats.duplicates += 1;
        } else if (outcome.outcome === "probe_failed") {
          stats.probe_failed += 1;
        }
        results.push({ name: entry.name, ...outcome, url: entry.streamUrl });
        await sleep(options.delayMs);
      }
    }
  }

  if (!options.skipRb) {
    try {
      const fresh = await discoverRbFresh(country, catalog);
      stats.rb_fresh = fresh.length;
      for (const candidate of fresh) {
        const outcome = await importPlayableCandidate(supabase, candidate, options.execute);
        if (outcome.outcome === "imported" || outcome.outcome === "dry_run_would_insert") {
          if (outcome.outcome === "imported") stats.imported += 1;
          else stats.dry_run += 1;
        } else if (outcome.outcome === "duplicate") {
          stats.duplicates += 1;
        } else if (outcome.outcome === "probe_failed") {
          stats.probe_failed += 1;
        }
        results.push({ name: candidate.name, source: "radio_browser", ...outcome });
        await sleep(options.delayMs);
      }
    } catch (error) {
      results.push({
        source: "radio_browser",
        outcome: "rb_fetch_failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stats.after = await publicCount(supabase, country.code);

  const queue = loadAfricaRadioQueue(adminRoot);
  const entry = getQueueEntry(queue, country.code);
  if (entry) {
    entry.imported += stats.imported;
    entry.duplicates += stats.duplicates;
    entry.rejected += stats.probe_failed + stats.rejected_url;
    entry.candidates_discovered += stats.m3u_entries + stats.rb_fresh;
    entry.candidates_tested += stats.m3u_entries + stats.rb_fresh;
    entry.public_playable_total = stats.after;
    entry.discovery_status = "completed";
    entry.last_completed_at = new Date().toISOString();
    entry.sources_searched = Array.from(
      new Set([
        ...(entry.sources_searched || []),
        ...(stats.m3u_file ? [`junguler:${stats.m3u_file}`] : []),
        "radio_browser:hidebroken=false",
      ])
    );
    entry.notes = [
      ...(entry.notes || []),
      `deep_curated imported=${stats.imported} m3u=${stats.m3u_entries} rb_fresh=${stats.rb_fresh} failed=${stats.probe_failed} public=${stats.before}->${stats.after}`,
    ];
    queue.current_country_code = country.code;
    saveAfricaRadioQueue(adminRoot, queue);
  }

  const reportPath = path.join(
    adminRoot,
    "data",
    "radio-africa-reports",
    `${country.code.toLowerCase()}-deep-curated-report.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ stats, results: results.slice(0, 200), finished_at: new Date().toISOString() }, null, 2)
  );
  return stats;
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let countries = AFRICA_RADIO_QUEUE.slice();
  if (options.only?.length) {
    countries = countries.filter((c) => options.only!.includes(c.code));
  } else {
    // Prefer thin countries first, then the rest.
    const queue = loadAfricaRadioQueue(adminRoot);
    countries = [...countries].sort((a, b) => {
      const pa = getQueueEntry(queue, a.code)?.public_playable_total ?? 0;
      const pb = getQueueEntry(queue, b.code)?.public_playable_total ?? 0;
      return pa - pb;
    });
  }
  countries = countries.slice(0, options.maxCountries);

  console.log(
    JSON.stringify(
      {
        mode: options.execute ? "execute" : "dry-run",
        countries: countries.map((c) => c.code),
        count: countries.length,
      },
      null,
      2
    )
  );

  const catalog = await loadCatalogDedupeIndex(supabase);
  const summary = [];
  for (const country of countries) {
    console.log(`\n=== DEEP ${country.code} ${country.name} ===`);
    const stats = await processCountry(supabase, country, catalog, options);
    summary.push(stats);
    console.log(
      JSON.stringify(
        {
          code: stats.code,
          imported: stats.imported,
          public: `${stats.before}->${stats.after}`,
          m3u: stats.m3u_entries,
          rb_fresh: stats.rb_fresh,
          failed: stats.probe_failed,
        },
        null,
        2
      )
    );
  }

  const totals = summary.reduce(
    (acc, s) => {
      acc.imported += s.imported;
      acc.probe_failed += s.probe_failed;
      acc.duplicates += s.duplicates;
      acc.public_delta += s.after - s.before;
      return acc;
    },
    { imported: 0, probe_failed: 0, duplicates: 0, public_delta: 0 }
  );
  const outPath = path.join(adminRoot, "data/radio-africa-reports/africa-deep-curated-summary.json");
  fs.writeFileSync(outPath, JSON.stringify({ totals, summary, finished_at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ outPath, totals }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
