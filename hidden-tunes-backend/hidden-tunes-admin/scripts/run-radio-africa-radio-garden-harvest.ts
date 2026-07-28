/**
 * Discover African station websites via Radio Garden search, scrape stream URLs,
 * then import through the existing probe + insert-only path.
 *
 *   npx tsx scripts/run-radio-africa-radio-garden-harvest.ts --discover
 *   npx tsx scripts/run-radio-africa-radio-garden-harvest.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { AFRICA_RADIO_QUEUE, getAfricanCountry } from "@/lib/radioAfricaExpansion/africanCountries";
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
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
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
const OUT = path.join(adminRoot, "data/radio-africa-reports/radio-garden-harvest-candidates.json");
const REPORT = path.join(adminRoot, "data/radio-africa-reports/radio-garden-harvest-import-report.json");
const UA = "Mozilla/5.0 HiddenTunesRadio/1.0";

type Seed = { code: string; name: string; url: string; attribution: string };

const MANUAL_SEEDS: Seed[] = [
  { code: "SZ", name: "SBIS Channel 1", url: "https://zas3.ndx.co.za:8002/stream", attribution: "ndx.co.za" },
  { code: "SZ", name: "SBIS Channel 3", url: "https://zas3.ndx.co.za:8042/stream", attribution: "ndx.co.za" },
  { code: "GN", name: "Espace FM Guinee", url: "https://stream1.svrdedicado.org:7188/stream", attribution: "espacefm" },
  { code: "GN", name: "Soleil FM Guinee", url: "http://stream.radiojar.com/7cu7t0tnr68uv", attribution: "radiojar" },
  { code: "ST", name: "RNSTP Radio Nacional", url: "https://radios2.justweb.pt:8086/stream", attribution: "rn-stp.com" },
  { code: "SO", name: "BBC Somali", url: "https://stream.live.vc.bbcmedia.co.uk/bbc_somali_radio", attribution: "bbc" },
  {
    code: "BF",
    name: "Pulsar Ouagadougou",
    url: "https://pulsarouagadougou.ice.infomaniak.ch/pulsarouagadougou-128.mp3",
    attribution: "infomaniak",
  },
];

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function isRejectedUrl(url: string) {
  if (/halo\.streamerr\.co\/listen\/italiavera/i.test(url)) return true;
  if (/antenna.?web/i.test(url)) return true;
  if (/openstream\.co\/.*[?&]k=/i.test(url)) return true;
  return false;
}

function extractStreams(html: string): string[] {
  const pattern =
    /https?:\/\/[^\s"'<>\\]+(?:stream\.zeno\.fm|stream\.radiojar\.com|listen\.radioking\.com|ice\.infomaniak\.ch|streams\.radio\.co|svrdedicado\.org|myradiostream\.com|justweb\.pt|ndx\.co\.za|paineldj|servidoresbrasil|stm\d+\.srvif\.com|bbcmedia\.co\.uk|\/stream|\/listen)[^\s"'<>\\]*/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(pattern)) {
    const url = m[0].replace(/[),;]+$/, "");
    if (isRejectedUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchRadioGarden(query: string) {
  const url = `https://radio.garden/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [] as Array<{
    code?: string;
    type?: string;
    page?: {
      url?: string;
      title?: string;
      website?: string;
      stream?: string;
      country?: { title?: string };
      place?: { title?: string };
    };
  }>;
  const json = (await res.json()) as {
    hits?: { hits?: Array<{ _source?: Record<string, unknown> }> };
  };
  return (json.hits?.hits || []).map((h) => h._source || {}) as Array<{
    code?: string;
    type?: string;
    page?: {
      url?: string;
      title?: string;
      website?: string;
      stream?: string;
      country?: { title?: string };
      place?: { title?: string };
    };
  }>;
}

function build(seed: Seed): NormalizedRadioStation | null {
  const country = getAfricanCountry(seed.code);
  if (!country) return null;
  const sourceStreamUrl = normalizeRadioUrl(seed.url, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(seed.name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;
  if (isRejectedUrl(sourceStreamUrl)) return null;
  const now = new Date().toISOString();
  const sourceStationId = `curated_${seed.code.toLowerCase()}_${hashId(normalizedStreamUrl)}`;
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: seed.code,
      normalized_homepage_host: null,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceStationId,
    source_station_id: sourceStationId,
    source_station_uuid: sourceStationId,
    source_server: `hidden_tunes_trusted_catalog:${seed.attribution}`,
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: null,
    normalized_homepage_host: getHomepageHost(null),
    favicon_url: null,
    country: country.name,
    country_code: seed.code,
    state: null,
    language: null,
    tags: [country.name.toLowerCase(), "curated", "africa", "radio_garden"],
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

async function discover(): Promise<Seed[]> {
  const seeds: Seed[] = [...MANUAL_SEEDS];
  const channelKeys = new Set<string>();
  const siteCache = new Map<string, string[]>();

  for (const country of AFRICA_RADIO_QUEUE) {
    const queries = [country.name, ...(country.cities || []).slice(0, 6)];
    for (const q of queries) {
      let hits: Awaited<ReturnType<typeof searchRadioGarden>> = [];
      try {
        hits = await searchRadioGarden(q);
      } catch {
        continue;
      }
      for (const hit of hits) {
        if (hit.type !== "channel" || !hit.page?.url || !hit.page.title) continue;
        const channelId = hit.page.url.split("/").pop();
        if (!channelId) continue;
        const key = `${country.code}|${channelId}`;
        if (channelKeys.has(key)) continue;
        // Prefer ISO match from RG when present; otherwise keep city-scoped hits.
        if (hit.code && hit.code !== country.code) continue;
        channelKeys.add(key);
        const website = hit.page.website?.trim();
        if (!website || website.includes("facebook.com") || website.includes("twitter.com")) continue;
        let found = siteCache.get(website);
        if (!found) {
          const html = await fetchText(website);
          found = html ? extractStreams(html) : [];
          siteCache.set(website, found);
          console.log(JSON.stringify({ site: website, code: country.code, streams: found.length }));
        }
        for (const url of found) {
          seeds.push({
            code: country.code,
            name: hit.page.title,
            url,
            attribution: `rg-site:${website}`,
          });
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const seen = new Set<string>();
  const unique = seeds.filter((s) => {
    const key = `${s.code}|${s.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));
  console.log(JSON.stringify({ candidates: unique.length, out: OUT }, null, 2));
  return unique;
}

async function importSeeds(seeds: Seed[], execute: boolean) {
  loadAdminEnv(adminRoot);
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const results: Array<Record<string, unknown>> = [];
  let imported = 0;
  let failed = 0;
  let duplicates = 0;

  for (const seed of seeds) {
    const candidate = build(seed);
    if (!candidate) {
      failed += 1;
      results.push({ ...seed, outcome: "normalize_failed" });
      continue;
    }
    const probe = await probeRadioStream(candidate.stream_url, {
      timeoutMs: 12_000,
      maxRedirects: 5,
      maxPlaylistBytes: 128 * 1024,
      maxReadBytes: 24 * 1024,
    });
    if (!probe.playable) {
      failed += 1;
      results.push({ ...seed, outcome: "probe_failed", reason: probe.outcome });
      continue;
    }
    const existing = await findExistingRadioStationId(supabase, candidate);
    if (existing) {
      duplicates += 1;
      results.push({ ...seed, outcome: "duplicate", id: existing.id });
      continue;
    }
    if (!execute) {
      imported += 1;
      results.push({ ...seed, outcome: "dry_run_would_insert" });
      continue;
    }
    const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (inserted.outcome !== "inserted" || !inserted.stationId) {
      failed += 1;
      results.push({ ...seed, outcome: inserted.outcome, error: inserted.error });
      continue;
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
    imported += 1;
    results.push({ ...seed, outcome: "imported", id: inserted.stationId });

    const queue = loadAfricaRadioQueue(adminRoot);
    const entry = getQueueEntry(queue, seed.code);
    if (entry) {
      entry.imported += 1;
      const { count } = await supabase
        .from("radio_stations")
        .select("id", { count: "exact", head: true })
        .eq("country_code", seed.code)
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("is_verified", true)
        .eq("playback_status", "playable")
        .eq("is_mature", false)
        .is("quarantined_at", null)
        .is("disabled_at", null)
        .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD);
      entry.public_playable_total = count || entry.public_playable_total;
      entry.last_completed_at = new Date().toISOString();
      saveAfricaRadioQueue(adminRoot, queue);
    }
    console.log(JSON.stringify({ imported: seed.code, name: seed.name }));
  }

  const out = {
    mode: execute ? "execute" : "dry-run",
    imported,
    failed,
    duplicates,
    results,
    finished_at: new Date().toISOString(),
  };
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ report: REPORT, imported, failed, duplicates }, null, 2));
}

async function main() {
  const discoverOnly = process.argv.includes("--discover");
  const execute = process.argv.includes("--execute");
  let seeds: Seed[] = [];
  if (discoverOnly || !fs.existsSync(OUT)) {
    seeds = await discover();
  } else {
    seeds = JSON.parse(fs.readFileSync(OUT, "utf8")) as Seed[];
    console.log(JSON.stringify({ loaded: seeds.length, from: OUT }));
  }
  if (discoverOnly) return;
  await importSeeds(seeds, execute);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
