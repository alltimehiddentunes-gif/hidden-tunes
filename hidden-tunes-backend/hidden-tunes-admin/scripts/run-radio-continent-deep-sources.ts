/**
 * Worldwide continent deep-source pass:
 * junguler M3U + Radio Garden site scrape + Radio Browser hidebroken=false.
 *
 *   npx tsx scripts/run-radio-continent-deep-sources.ts --continent europe --country GB --execute
 *   npx tsx scripts/run-radio-continent-deep-sources.ts --continent europe --max-countries 5 --execute
 *   npx tsx scripts/run-radio-continent-deep-sources.ts --continent europe --blocked-first --execute
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { getContinentQueue, getWorldwideCountry } from "@/lib/radioWorldwideExpansion/continents";
import { buildCuratedNormalizedStation } from "@/lib/radioWorldwideExpansion/deepSources/buildCuratedCandidate";
import { importPlayableCandidate } from "@/lib/radioWorldwideExpansion/deepSources/importPlayable";
import { fetchM3uForCountry } from "@/lib/radioWorldwideExpansion/deepSources/jungulerM3u";
import { discoverRadioBrowserDeep } from "@/lib/radioWorldwideExpansion/deepSources/radioBrowserDeep";
import { discoverRadioGardenSeeds } from "@/lib/radioWorldwideExpansion/deepSources/radioGardenDiscover";
import {
  getWorldwideQueueEntry,
  loadContinentRadioQueue,
  saveContinentRadioQueue,
  saveWorldwideMasterReport,
} from "@/lib/radioWorldwideExpansion/queue";
import type { WorldwideContinentId, WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";
import { WORLDWIDE_CONTINENT_ORDER } from "@/lib/radioWorldwideExpansion/types";
import {
  isCatalogDuplicate,
  loadCatalogDedupeIndex,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { isMatureRadioCandidate } from "@/lib/radioExpansion25k/radioBrowserFetch";
import type { NormalizedRadioStation } from "@/lib/radioNormalization";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";

const adminRoot = path.resolve(__dirname, "..");
const USER_AGENT = "HiddenTunes/1.0 worldwide-deep-sources";

function parseContinent(raw: string | null): WorldwideContinentId | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((WORLDWIDE_CONTINENT_ORDER as string[]).includes(normalized)) {
    return normalized as WorldwideContinentId;
  }
  return null;
}

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const continentIndex = process.argv.indexOf("--continent");
  const countryIndex = process.argv.indexOf("--country");
  const maxIndex = process.argv.indexOf("--max-countries");
  const sourcesIndex = process.argv.indexOf("--sources");
  const sourcesRaw =
    sourcesIndex >= 0
      ? String(process.argv[sourcesIndex + 1] || "m3u,rb,radio_garden")
      : "m3u,rb,radio_garden";
  const sources = new Set(
    sourcesRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return {
    execute: args.has("--execute"),
    discoverOnly: args.has("--discover"),
    continent: parseContinent(
      continentIndex >= 0 ? String(process.argv[continentIndex + 1] || "") : null
    ),
    country: countryIndex >= 0 ? String(process.argv[countryIndex + 1] || "").toUpperCase() : null,
    maxCountries:
      maxIndex >= 0
        ? Number(process.argv[maxIndex + 1])
        : Number(process.env.WORLDWIDE_DEEP_MAX || 1),
    blockedFirst: args.has("--blocked-first"),
    thinFirst: args.has("--thin-first"),
    sources,
    skipM3u: args.has("--skip-m3u") || !sources.has("m3u"),
    skipRb: args.has("--skip-rb") || !sources.has("rb"),
    skipRadioGarden: args.has("--skip-radio-garden") || !sources.has("radio_garden"),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 500),
    maxCandidates: Number(process.env.WORLDWIDE_DEEP_MAX_CANDIDATES || 400),
    // Large markets: lower concurrency pressure via candidate cap.
    crashSafe: args.has("--crash-safe"),
  };
}

function reportsDir(continent: WorldwideContinentId) {
  return path.join(adminRoot, "data", `radio-${continent}-reports`);
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function publicPlayableCount(supabase: ReturnType<typeof createClient>, code: string) {
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

function selectCountries(
  continent: WorldwideContinentId,
  options: ReturnType<typeof readArgs>
): WorldwideRadioCountry[] {
  const queue = loadContinentRadioQueue(adminRoot, continent);
  const meta = getContinentQueue(continent);
  if (options.country) {
    const one = getWorldwideCountry(continent, options.country);
    if (!one) throw new Error(`Country ${options.country} not in ${continent}`);
    return [one];
  }

  let ordered = [...meta];
  if (options.blockedFirst) {
    const blocked = new Set(
      queue.countries.filter((c) => c.discovery_status === "blocked").map((c) => c.code)
    );
    ordered = [
      ...ordered.filter((c) => blocked.has(c.code)),
      ...ordered.filter((c) => !blocked.has(c.code)),
    ];
  }
  if (options.thinFirst) {
    const byPublic = new Map(queue.countries.map((c) => [c.code, c.public_playable_total || 0]));
    ordered = [...ordered].sort(
      (a, b) => (byPublic.get(a.code) || 0) - (byPublic.get(b.code) || 0)
    );
  }

  // Skip countries already marked with deep_sources_completed note unless forced by --country.
  ordered = ordered.filter((c) => {
    const entry = getWorldwideQueueEntry(queue, c.code);
    const notes = entry?.notes || [];
    const deepDone = notes.some((n) => String(n).includes("deep_sources_completed"));
    // Also skip if a deep report already exists on disk (guards against queue races).
    const reportExists = fs.existsSync(
      path.join(adminRoot, "data", `radio-${continent}-reports`, `${c.code.toLowerCase()}-deep-report.json`)
    );
    return !deepDone && !reportExists;
  });

  return ordered.slice(0, Math.max(1, options.maxCountries));
}

async function discoverCountry(
  country: WorldwideRadioCountry,
  options: ReturnType<typeof readArgs>
) {
  const catalog = await loadCatalogDedupeIndex(
    createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  );

  const candidates: NormalizedRadioStation[] = [];
  const sourcesSearched: string[] = [];
  const seenStream = new Set<string>();

  function accept(candidate: NormalizedRadioStation | null, sourceKey: string) {
    if (!candidate) return;
    if (candidates.length >= options.maxCandidates) return;
    if (
      isMatureRadioCandidate({
        name: candidate.name,
        tags: candidate.tags,
        category_slug: candidate.category_slug,
      })
    ) {
      return;
    }
    if (seenStream.has(candidate.normalized_stream_url)) return;
    if (isCatalogDuplicate(candidate, catalog)) return;
    seenStream.add(candidate.normalized_stream_url);
    catalog.streams.add(candidate.normalized_stream_url);
    catalog.fingerprints.add(candidate.station_fingerprint);
    catalog.sourceKeys.add(`${candidate.source_name}:${candidate.source_station_id}`);
    candidates.push(candidate);
    sourcesSearched.push(sourceKey);
  }

  if (!options.skipM3u) {
    const m3u = await fetchM3uForCountry(country, USER_AGENT);
    sourcesSearched.push(`deep:m3u:${country.code}`);
    if (m3u) {
      for (const entry of m3u.entries) {
        accept(
          buildCuratedNormalizedStation({
            country,
            name: entry.name,
            streamUrl: entry.streamUrl,
            attribution: `junguler-m3u:${m3u.file}`,
            tags: [country.name.toLowerCase(), country.continent, "curated", "junguler_m3u"],
          }),
          `deep:m3u:${m3u.file}`
        );
      }
    }
  }

  if (!options.skipRadioGarden) {
    sourcesSearched.push(`deep:radio_garden:${country.code}`);
    const seeds = await discoverRadioGardenSeeds(country, { cityLimit: 6, delayMs: 150 });
    for (const seed of seeds) {
      accept(
        buildCuratedNormalizedStation({
          country,
          name: seed.name,
          streamUrl: seed.url,
          attribution: seed.attribution,
          tags: [country.name.toLowerCase(), country.continent, "curated", "radio_garden"],
        }),
        `deep:rg:${seed.attribution}`
      );
    }
  }

  if (!options.skipRb) {
    sourcesSearched.push(`deep:rb_hidebroken:${country.code}`);
    const rb = await discoverRadioBrowserDeep(country, catalog, {
      maxPages: 16,
      delayMs: options.delayMs,
      userAgent: USER_AGENT,
    });
    for (const candidate of rb) accept(candidate, `deep:rb:${country.code}`);
  }

  return {
    candidates,
    sourcesSearched: Array.from(new Set(sourcesSearched)),
  };
}

async function runCountry(
  continent: WorldwideContinentId,
  country: WorldwideRadioCountry,
  options: ReturnType<typeof readArgs>
) {
  const started = performance.now();
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const before = await publicPlayableCount(supabase, country.code);
  const discovery = await discoverCountry(country, options);
  const candidatesPath = path.join(
    reportsDir(continent),
    `${country.code.toLowerCase()}-deep-candidates.json`
  );
  ensureDir(candidatesPath);
  fs.writeFileSync(
    candidatesPath,
    JSON.stringify(
      {
        updated_at: new Date().toISOString(),
        country: country.code,
        candidates: discovery.candidates,
        sources_searched: discovery.sourcesSearched,
      },
      null,
      2
    )
  );

  const stats = {
    discovered: discovery.candidates.length,
    imported: 0,
    duplicates: 0,
    probe_failed: 0,
    dry_run_would_insert: 0,
    insert_failed: 0,
  };

  if (!options.discoverOnly) {
    for (const candidate of discovery.candidates) {
      const result = await importPlayableCandidate(supabase, candidate, options.execute);
      if (result.outcome === "imported") stats.imported += 1;
      else if (result.outcome === "duplicate") stats.duplicates += 1;
      else if (result.outcome === "probe_failed") stats.probe_failed += 1;
      else if (result.outcome === "dry_run_would_insert") stats.dry_run_would_insert += 1;
      else stats.insert_failed += 1;
    }
  }

  const after = await publicPlayableCount(supabase, country.code);
  const queue = loadContinentRadioQueue(adminRoot, continent);
  const entry = getWorldwideQueueEntry(queue, country.code);
  if (entry) {
    entry.sources_searched = Array.from(
      new Set([...(entry.sources_searched || []), ...discovery.sourcesSearched])
    );
    entry.candidates_discovered += discovery.candidates.length;
    entry.imported += stats.imported;
    entry.duplicates += stats.duplicates;
    entry.rejected += stats.probe_failed;
    entry.public_playable_total = after;
    entry.notes = [
      ...(entry.notes || []).filter((n) => !String(n).includes("deep_sources_")),
      `deep_sources_completed:${new Date().toISOString()} imported=${stats.imported} discovered=${stats.discovered}`,
    ];
    // Unblock crash victims if deep pass finished cleanly.
    if (entry.discovery_status === "blocked" && options.execute) {
      entry.discovery_status = "completed";
      entry.unresolved_blockers = [];
      entry.last_completed_at = new Date().toISOString();
    }
    saveContinentRadioQueue(adminRoot, queue);
    saveWorldwideMasterReport(adminRoot);
  }

  const report = {
    mode: options.execute ? "execute" : options.discoverOnly ? "discover" : "dry-run",
    continent,
    code: country.code,
    country: country.name,
    before_public: before,
    after_public: after,
    delta_public: after - before,
    stats,
    sources_searched: discovery.sourcesSearched,
    duration_ms: Math.round(performance.now() - started),
    candidates_path: candidatesPath,
    finished_at: new Date().toISOString(),
  };
  const reportPath = path.join(reportsDir(continent), `${country.code.toLowerCase()}-deep-report.json`);
  ensureDir(reportPath);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  if (!options.continent) {
    throw new Error("Pass --continent europe|north_america|south_america|asia|oceania|antarctica");
  }
  const selected = selectCountries(options.continent, options);
  console.log(
    JSON.stringify(
      {
        continent: options.continent,
        mode: options.execute ? "execute" : options.discoverOnly ? "discover" : "dry-run",
        selected: selected.map((c) => c.code),
        sources: {
          m3u: !options.skipM3u,
          rb: !options.skipRb,
          radio_garden: !options.skipRadioGarden,
        },
      },
      null,
      2
    )
  );

  if (!selected.length) {
    console.log(
      JSON.stringify(
        {
          completed: 0,
          imported: 0,
          discovered: 0,
          continent_exhausted: true,
        },
        null,
        2
      )
    );
    // Distinct from crash (nonzero) and success (0): overnight advances continent.
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const country of selected) {
    console.log(`\n=== Deep sources: ${options.continent}/${country.code} ${country.name} ===`);
    results.push(await runCountry(options.continent, country, options));
  }
  console.log(
    JSON.stringify(
      {
        completed: results.length,
        imported: results.reduce((s, r) => s + r.stats.imported, 0),
        discovered: results.reduce((s, r) => s + r.stats.discovered, 0),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
