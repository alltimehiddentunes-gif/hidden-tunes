/**
 * Worldwide continent Radio country expansion — one country at a time.
 *
 * Usage:
 *   npx tsx scripts/run-radio-continent-country-expand.ts --continent europe --country DE --execute
 *   npx tsx scripts/run-radio-continent-country-expand.ts --continent europe --seed-queue
 *   npx tsx scripts/run-radio-continent-country-expand.ts --continent europe --status
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getWorldwideCountry } from "@/lib/radioWorldwideExpansion/continents";
import { buildContinentCountryQueries } from "@/lib/radioWorldwideExpansion/countryQueries";
import {
  getWorldwideQueueEntry,
  loadContinentRadioQueue,
  saveContinentRadioQueue,
  saveWorldwideMasterReport,
  type WorldwideCountryQueueEntry,
} from "@/lib/radioWorldwideExpansion/queue";
import type { WorldwideContinentId } from "@/lib/radioWorldwideExpansion/types";
import { WORLDWIDE_CONTINENT_ORDER } from "@/lib/radioWorldwideExpansion/types";
import {
  type CatalogDedupeIndex,
  isCatalogDuplicate,
  loadCatalogDedupeIndex,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { insertNewRadioStationOnly } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchRadioBrowserJson,
  isMatureRadioCandidate,
  sleep,
} from "@/lib/radioExpansion25k/radioBrowserFetch";
import {
  buildRadioBrowserPath,
  type RadioExpansionQuery,
} from "@/lib/radioExpansion25k/sourceQueries";
import {
  normalizeRadioBrowserStationForImport,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
  type RadioStreamProbeResult,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");
const USER_AGENT = "HiddenTunes/1.0 worldwide-continent-expand";

type Mode = "dry-run" | "execute";

type ContinentCandidate = NormalizedRadioStation & {
  discovered_query_key: string;
};

type VerifyRow = {
  id: string;
  name: string | null;
  stream_url: string | null;
  source_stream_url: string | null;
  playback_status: string | null;
  reliability_score: number | null;
  consecutive_failures: number | null;
  quarantined_at: string | null;
  disabled_at: string | null;
  is_verified: boolean | null;
};

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
  const maxPagesIndex = process.argv.indexOf("--max-pages-per-query");
  const verifyLimitIndex = process.argv.indexOf("--verify-limit");
  return {
    mode: args.has("--execute") ? ("execute" as Mode) : ("dry-run" as Mode),
    continent: parseContinent(
      continentIndex >= 0 ? String(process.argv[continentIndex + 1] || "") : null
    ),
    country: countryIndex >= 0 ? String(process.argv[countryIndex + 1] || "").toUpperCase() : null,
    seedQueue: args.has("--seed-queue"),
    statusOnly: args.has("--status"),
    skipDiscover: args.has("--skip-discover"),
    skipImport: args.has("--skip-import"),
    skipVerify: args.has("--skip-verify"),
    skipRepair: args.has("--skip-repair"),
    maxPagesPerQuery:
      maxPagesIndex >= 0
        ? Number(process.argv[maxPagesIndex + 1])
        : Number(process.env.WORLDWIDE_MAX_PAGES || process.env.AFRICA_MAX_PAGES || 40),
    verifyLimit:
      verifyLimitIndex >= 0
        ? Number(process.argv[verifyLimitIndex + 1])
        : Number(process.env.WORLDWIDE_VERIFY_LIMIT || 0) || null,
    pageSize: Number(process.env.RADIO_BATCH_PAGE_SIZE || 25),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 750),
    concurrency: Number(process.env.WORLDWIDE_CONCURRENCY || process.env.AFRICA_CONCURRENCY || 3),
    timeoutMs: Number(process.env.RADIO_VERIFY_TIMEOUT_MS || 12_000),
    retries: Number(process.env.RADIO_VERIFY_RETRIES || 2),
  };
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function reportsDir(continent: WorldwideContinentId) {
  return path.join(adminRoot, "data", `radio-${continent}-reports`);
}

function reportPath(continent: WorldwideContinentId, code: string) {
  return path.join(reportsDir(continent), `${code.toLowerCase()}-expand-report.json`);
}

function checkpointPath(continent: WorldwideContinentId, code: string) {
  return path.join(reportsDir(continent), `${code.toLowerCase()}-candidates.json`);
}

async function countCountry(
  supabase: SupabaseClient,
  code: string,
  extra?: (q: unknown) => unknown
) {
  let query = supabase
    .from("radio_stations")
    .select("id", { count: "exact", head: true })
    .eq("country_code", code);
  if (extra) query = extra(query) as typeof query;
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function publicPlayableCount(supabase: SupabaseClient, code: string) {
  return countCountry(supabase, code, (q) =>
    (q as any)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("is_mature", false)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD)
  );
}

async function maturePublicCount(supabase: SupabaseClient, code: string) {
  return countCountry(supabase, code, (q) =>
    (q as any)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("is_mature", true)
      .eq("mature_source_approved", true)
      .eq("mature_review_status", "confirmed")
      .eq("rights_status", "approved")
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD)
  );
}

async function fetchQueryPage(
  query: RadioExpansionQuery,
  offset: number,
  options: ReturnType<typeof readArgs>
) {
  const apiPath = buildRadioBrowserPath(query, options.pageSize, offset);
  return fetchRadioBrowserJson(apiPath, {
    timeoutMs: options.timeoutMs,
    userAgent: USER_AGENT,
    maxRetries: 4,
  });
}

async function discoverCountry(
  continent: WorldwideContinentId,
  countryCode: string,
  countryName: string,
  queries: RadioExpansionQuery[],
  options: ReturnType<typeof readArgs>,
  catalogIndex: CatalogDedupeIndex
) {
  const candidates: ContinentCandidate[] = [];
  const seenSource = new Set<string>();
  const seenStream = new Set<string>();
  const seenFingerprint = new Set<string>();
  const sourcesSearched: string[] = [];
  const exhausted: string[] = [];
  const failedPages: Array<{ query_key: string; offset: number; reason: string }> = [];

  for (const query of queries) {
    sourcesSearched.push(query.key);
    let offset = 0;
    let emptyStreak = 0;
    for (let page = 0; page < options.maxPagesPerQuery; page += 1) {
      try {
        const { stations, server } = await fetchQueryPage(query, offset, options);
        if (!stations.length) {
          emptyStreak += 1;
          if (emptyStreak >= 2) {
            exhausted.push(query.key);
            break;
          }
          offset += options.pageSize;
          await sleep(options.delayMs);
          continue;
        }
        emptyStreak = 0;
        let acceptedThisPage = 0;
        for (const raw of stations) {
          const normalized = normalizeRadioBrowserStationForImport(raw, query.categorySlug, {
            now: new Date().toISOString(),
            sourceServer: server,
          });
          if (!normalized) continue;
          if (normalized.country_code && normalized.country_code !== countryCode) {
            continue;
          }
          if (!normalized.country_code) {
            normalized.country_code = countryCode;
            if (!normalized.country) normalized.country = countryName;
          }
          if (
            isMatureRadioCandidate({
              name: normalized.name,
              tags: normalized.tags,
              category_slug: normalized.category_slug,
            })
          ) {
            continue;
          }
          const sourceKey = `${normalized.source_name}:${normalized.source_station_id}`;
          if (
            seenSource.has(sourceKey) ||
            seenStream.has(normalized.normalized_stream_url) ||
            seenFingerprint.has(normalized.station_fingerprint)
          ) {
            continue;
          }
          if (isCatalogDuplicate(normalized, catalogIndex)) {
            continue;
          }
          seenSource.add(sourceKey);
          seenStream.add(normalized.normalized_stream_url);
          seenFingerprint.add(normalized.station_fingerprint);
          catalogIndex.sourceKeys.add(sourceKey);
          catalogIndex.streams.add(normalized.normalized_stream_url);
          catalogIndex.fingerprints.add(normalized.station_fingerprint);
          candidates.push({ ...normalized, discovered_query_key: query.key });
          acceptedThisPage += 1;
        }
        if (stations.length < options.pageSize) {
          exhausted.push(query.key);
          break;
        }
        if (acceptedThisPage === 0 && (query.kind === "name" || query.kind === "language")) {
          emptyStreak += 1;
          if (emptyStreak >= 2) {
            exhausted.push(query.key);
            break;
          }
        }
        offset += options.pageSize;
        await sleep(options.delayMs);
      } catch (error) {
        failedPages.push({
          query_key: query.key,
          offset,
          reason: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  }

  return {
    candidates,
    sourcesSearched: Array.from(new Set(sourcesSearched)),
    exhausted,
    failedPages,
  };
}

async function importCandidates(
  supabase: SupabaseClient,
  candidates: ContinentCandidate[],
  options: ReturnType<typeof readArgs>
) {
  const stats = {
    imported: 0,
    duplicates: 0,
    failed: 0,
    dry_run_would_insert: 0,
    insertedIds: [] as string[],
  };
  for (const candidate of candidates) {
    const result = await insertNewRadioStationOnly(supabase, candidate, {
      dryRun: options.mode !== "execute",
    });
    if (result.outcome === "inserted") {
      stats.imported += 1;
      if (result.stationId) stats.insertedIds.push(result.stationId);
    } else if (result.outcome === "duplicate") {
      stats.duplicates += 1;
    } else if (result.outcome === "dry_run_would_insert") {
      stats.dry_run_would_insert += 1;
    } else {
      stats.failed += 1;
    }
  }
  return stats;
}

async function loadCountryVerifyRows(
  supabase: SupabaseClient,
  code: string,
  forceAllFailed: boolean
) {
  const rows: VerifyRow[] = [];
  let from = 0;
  while (from < 50_000) {
    let query = supabase
      .from("radio_stations")
      .select(
        "id,name,stream_url,source_stream_url,playback_status,reliability_score,consecutive_failures,quarantined_at,disabled_at,is_verified"
      )
      .eq("country_code", code)
      .order("id")
      .range(from, from + 999);
    if (!forceAllFailed) {
      query = query.or(
        "playback_status.eq.unchecked,playback_status.eq.failed,quarantined_at.not.is.null,is_verified.eq.false"
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as VerifyRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function probeWithRetries(row: VerifyRow, options: ReturnType<typeof readArgs>) {
  let last: RadioStreamProbeResult | null = null;
  const url = row.stream_url || row.source_stream_url;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const probe = await probeRadioStream(url, {
      timeoutMs: options.timeoutMs,
      maxRedirects: 5,
      maxPlaylistBytes: 128 * 1024,
      maxReadBytes: 24 * 1024,
    });
    last = probe;
    if (probe.playable || !probe.retryable) return probe;
    if (attempt < options.retries) {
      await sleep(Math.min(12_000, 1_200 * 2 ** attempt));
    }
  }
  return last as RadioStreamProbeResult;
}

async function verifyRows(
  supabase: SupabaseClient,
  rows: VerifyRow[],
  options: ReturnType<typeof readArgs>
) {
  const selected = options.verifyLimit ? rows.slice(0, options.verifyLimit) : rows;
  const stats = {
    tested: 0,
    playable: 0,
    restored: 0,
    quarantined: 0,
    rejected: 0,
    updated: 0,
    outcomes: {} as Record<string, number>,
  };

  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      const row = selected[index];
      if (!row) break;
      stats.tested += 1;
      const wasQuarantined = Boolean(row.quarantined_at);
      try {
        const probe = await probeWithRetries(row, options);
        stats.outcomes[probe.outcome] = (stats.outcomes[probe.outcome] || 0) + 1;
        if (probe.playable) {
          stats.playable += 1;
          if (wasQuarantined) stats.restored += 1;
        } else {
          stats.rejected += 1;
          if (!probe.retryable) stats.quarantined += 1;
        }
        if (options.mode === "execute") {
          const update = applyRadioVerificationProbe(row, probe);
          const payload: Record<string, unknown> = { ...update };
          if (probe.playable && probe.finalUrl) {
            if (String(probe.finalUrl).startsWith("https://")) {
              payload.stream_url = probe.finalUrl;
            }
            payload.resolved_stream_url = probe.finalUrl;
            payload.delivery_mode = String(probe.finalUrl).startsWith("https://")
              ? "direct_https"
              : "backend_relay";
          }
          const { error } = await supabase.from("radio_stations").update(payload).eq("id", row.id);
          if (error) throw error;
          stats.updated += 1;
        }
      } catch {
        stats.rejected += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, () => worker()));
  return stats;
}

function printStatus(entry: WorldwideCountryQueueEntry) {
  console.log(
    JSON.stringify(
      {
        continent: entry.continent,
        code: entry.code,
        country: entry.country,
        discovery_status: entry.discovery_status,
        candidates_discovered: entry.candidates_discovered,
        candidates_tested: entry.candidates_tested,
        imported: entry.imported,
        restored: entry.restored,
        duplicates: entry.duplicates,
        quarantined: entry.quarantined,
        rejected: entry.rejected,
        public_playable_total: entry.public_playable_total,
        mature_public_total: entry.mature_public_total,
        last_completed_at: entry.last_completed_at,
        unresolved_blockers: entry.unresolved_blockers,
        sources_searched: entry.sources_searched.length,
      },
      null,
      2
    )
  );
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();

  if (!options.continent) {
    throw new Error(
      "Pass --continent europe|north_america|south_america|asia|oceania|antarctica|africa"
    );
  }

  const continent = options.continent;
  const queue = loadContinentRadioQueue(adminRoot, continent);

  if (options.seedQueue || options.statusOnly) {
    if (options.seedQueue) {
      const supabase = createClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      for (const entry of queue.countries) {
        entry.public_playable_total = await publicPlayableCount(supabase, entry.code);
        entry.mature_public_total = await maturePublicCount(supabase, entry.code);
      }
      saveContinentRadioQueue(adminRoot, queue);
      saveWorldwideMasterReport(adminRoot);
      console.log(
        JSON.stringify(
          {
            seeded: true,
            continent,
            path: path.join(adminRoot, "data", `radio-${continent}-expansion-queue.json`),
            countries: queue.countries.length,
            sample: queue.countries.slice(0, 12).map((c) => ({
              code: c.code,
              public_playable_total: c.public_playable_total,
              discovery_status: c.discovery_status,
            })),
          },
          null,
          2
        )
      );
      return;
    }
    console.log(
      JSON.stringify(
        {
          continent,
          updated_at: queue.updated_at,
          current_country_code: queue.current_country_code,
          countries: queue.countries.map((c) => ({
            code: c.code,
            status: c.discovery_status,
            public_playable_total: c.public_playable_total,
            imported: c.imported,
            last_completed_at: c.last_completed_at,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  if (!options.country) {
    throw new Error("Pass --country DE (or another ISO code), or --seed-queue / --status");
  }

  const meta = getWorldwideCountry(continent, options.country);
  if (!meta) throw new Error(`Country ${options.country} is not in the ${continent} queue`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const entry = getWorldwideQueueEntry(queue, meta.code)!;
  entry.discovery_status = "in_progress";
  queue.current_country_code = meta.code;
  saveContinentRadioQueue(adminRoot, queue);
  saveWorldwideMasterReport(adminRoot);

  const started = performance.now();
  const beforePublic = await publicPlayableCount(supabase, meta.code);
  const beforeMature = await maturePublicCount(supabase, meta.code);
  const beforeTotal = await countCountry(supabase, meta.code);

  const report: Record<string, unknown> = {
    mode: options.mode,
    continent,
    country: meta.name,
    code: meta.code,
    started_at: new Date().toISOString(),
    before: { total: beforeTotal, public_playable: beforePublic, mature_public: beforeMature },
  };

  let repairStats = {
    tested: 0,
    playable: 0,
    restored: 0,
    quarantined: 0,
    rejected: 0,
    updated: 0,
    outcomes: {} as Record<string, number>,
  };
  if (!options.skipRepair) {
    const repairRows = await loadCountryVerifyRows(supabase, meta.code, false);
    repairStats = await verifyRows(supabase, repairRows, options);
    report.repair = repairStats;
  }

  let candidates: ContinentCandidate[] = [];
  if (!options.skipDiscover) {
    const catalogIndex = await loadCatalogDedupeIndex(supabase);
    const queries = buildContinentCountryQueries(continent, meta);
    const discovery = await discoverCountry(
      continent,
      meta.code,
      meta.name,
      queries,
      options,
      catalogIndex
    );
    candidates = discovery.candidates;
    ensureDir(checkpointPath(continent, meta.code));
    fs.writeFileSync(
      checkpointPath(continent, meta.code),
      JSON.stringify({ updated_at: new Date().toISOString(), candidates }, null, 2)
    );
    report.discovery = {
      sources_searched: discovery.sourcesSearched.length,
      exhausted_queries: discovery.exhausted.length,
      failed_pages: discovery.failedPages,
      candidates_discovered: candidates.length,
      sample_names: candidates.slice(0, 20).map((c) => c.name),
    };
    entry.sources_searched = discovery.sourcesSearched;
    entry.candidates_discovered = candidates.length;
  } else if (fs.existsSync(checkpointPath(continent, meta.code))) {
    const saved = JSON.parse(
      fs.readFileSync(checkpointPath(continent, meta.code), "utf8")
    ) as { candidates: ContinentCandidate[] };
    candidates = saved.candidates || [];
    entry.candidates_discovered = candidates.length;
  }

  let importStats = {
    imported: 0,
    duplicates: 0,
    failed: 0,
    dry_run_would_insert: 0,
    insertedIds: [] as string[],
  };
  if (!options.skipImport && candidates.length) {
    importStats = await importCandidates(supabase, candidates, options);
    report.import = importStats;
    entry.imported += importStats.imported;
    entry.duplicates += importStats.duplicates;
  }

  let verifyStats = {
    tested: 0,
    playable: 0,
    restored: 0,
    quarantined: 0,
    rejected: 0,
    updated: 0,
    outcomes: {} as Record<string, number>,
  };
  if (!options.skipVerify) {
    const verifyRowsList = await loadCountryVerifyRows(supabase, meta.code, false);
    verifyStats = await verifyRows(supabase, verifyRowsList, options);
    report.verify = verifyStats;
  }

  const afterPublic = await publicPlayableCount(supabase, meta.code);
  const afterMature = await maturePublicCount(supabase, meta.code);
  const afterTotal = await countCountry(supabase, meta.code);
  report.after = { total: afterTotal, public_playable: afterPublic, mature_public: afterMature };
  report.delta = {
    total: afterTotal - beforeTotal,
    public_playable: afterPublic - beforePublic,
    mature_public: afterMature - beforeMature,
  };
  report.duration_ms = Math.round(performance.now() - started);
  report.finished_at = new Date().toISOString();

  entry.candidates_tested = Number(repairStats.tested || 0) + Number(verifyStats.tested || 0);
  entry.restored += Number(repairStats.restored || 0) + Number(verifyStats.restored || 0);
  entry.quarantined += Number(repairStats.quarantined || 0) + Number(verifyStats.quarantined || 0);
  entry.rejected += Number(repairStats.rejected || 0) + Number(verifyStats.rejected || 0);
  entry.public_playable_total = afterPublic;
  entry.mature_public_total = afterMature;
  entry.last_completed_at = new Date().toISOString();
  entry.next_verification_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  entry.discovery_status = options.mode === "execute" ? "completed" : "in_progress";
  entry.unresolved_blockers = [];
  if (
    afterPublic === beforePublic &&
    importStats.imported === 0 &&
    Number(repairStats.restored || 0) === 0
  ) {
    entry.notes = [
      ...(entry.notes || []),
      "No public playable delta this run; sources may be exhausted or all candidates failing verification.",
    ];
  }
  queue.current_country_code = meta.code;
  saveContinentRadioQueue(adminRoot, queue);
  saveWorldwideMasterReport(adminRoot);

  ensureDir(reportPath(continent, meta.code));
  fs.writeFileSync(reportPath(continent, meta.code), JSON.stringify(report, null, 2));
  printStatus(entry);
  console.log(JSON.stringify({ report_path: reportPath(continent, meta.code), summary: report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
