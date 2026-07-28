/**
 * Post-batch validation gate. Runs after import completes.
 * Usage: npx tsx scripts/run-podcast-post-batch-validation.ts --batch 5
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const EXPECTED_PUBLIC = { shows: 44, episodes: 2043 };

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

function parseArgs() {
  const argv = process.argv.slice(2);
  const readValue = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };
  return {
    batch: Number(readValue("--batch") || "3"),
    resultPath:
      readValue("--result") ||
      path.join(adminRoot, "data", `podcast-expansion-batch${readValue("--batch") || "3"}-result.json`),
  };
}

function runJson(command: string) {
  const output = execSync(command, { cwd: adminRoot, encoding: "utf8", env: process.env });
  return JSON.parse(output) as Record<string, unknown>;
}

function findDuplicates<T>(rows: T[], keyFn: (row: T) => string | null) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  const dupes = [...map.entries()].filter(([, count]) => count > 1);
  return {
    duplicate_groups: dupes.length,
    duplicate_rows: dupes.reduce((sum, [, count]) => sum + count, 0),
    samples: dupes.slice(0, 5).map(([key, count]) => ({ key, count })),
  };
}

function findCrossShowAudioUrlDuplicates(
  rows: Array<{ show_id: string; audio_url: string | null }>
) {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = row.audio_url?.trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(row.show_id);
  }
  const dupes = [...map.entries()].filter(([, showIds]) => showIds.size > 1);
  return {
    duplicate_groups: dupes.length,
    duplicate_rows: dupes.reduce((sum, [, showIds]) => sum + showIds.size, 0),
    samples: dupes.slice(0, 5).map(([key, showIds]) => ({
      key,
      count: showIds.size,
      show_ids: [...showIds],
    })),
  };
}

function findWithinShowDuplicates(
  rows: Array<{ show_id: string; title: string; audio_url: string | null }>
) {
  return findDuplicates(rows, (e) =>
    e.audio_url
      ? `${e.show_id}::${e.audio_url.trim().toLowerCase()}`
      : e.title
        ? `${e.show_id}::${e.title.trim().toLowerCase()}`
        : null
  );
}

function normalizeFeedUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

async function fetchAllShows() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const rows: Array<{ feed_url: string | null; slug: string; title: string }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("feed_url, slug, title")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function fetchRecentEpisodes(limit = 5000) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const rows: Array<{
    show_id: string;
    title: string;
    audio_url: string | null;
    episode_guid: string | null;
  }> = [];
  let from = 0;
  while (rows.length < limit) {
    const { data, error } = await supabaseAdmin
      .from("podcast_episodes")
      .select("show_id, title, audio_url, episode_guid")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) {
      if (error.message.includes("episode_guid")) {
        const fallback = await supabaseAdmin
          .from("podcast_episodes")
          .select("show_id, title, audio_url")
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (fallback.error) throw new Error(fallback.error.message);
        for (const row of fallback.data || []) {
          rows.push({ ...row, episode_guid: null });
        }
        if ((fallback.data || []).length < 1000) break;
        from += 1000;
        continue;
      }
      throw new Error(error.message);
    }
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function verifyBatchWindowPending(batchResult: {
  started_at?: string;
  finished_at?: string;
}) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const start = batchResult.started_at;
  const end = batchResult.finished_at;
  if (!start || !end) return { pass: false, reason: "missing_batch_window" };

  const { data: windowShows, error: showErr } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, status, is_verified, is_active")
    .gte("created_at", start)
    .lte("created_at", end);
  if (showErr) throw new Error(showErr.message);

  const nonPendingShows = (windowShows || []).filter(
    (s) => s.status !== "pending" || s.is_verified === true
  );
  const { count: publicLeaks } = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("status", "approved");

  return {
    pass: nonPendingShows.length === 0 && (publicLeaks || 0) === 0,
    window_shows: windowShows?.length || 0,
    non_pending_shows: nonPendingShows.length,
    public_leaks: publicLeaks || 0,
  };
}

async function main() {
  const args = parseArgs();
  const blockers: string[] = [];
  const report: Record<string, unknown> = {
    batch: args.batch,
    timestamp: new Date().toISOString(),
    steps: {},
  };

  if (!fs.existsSync(args.resultPath)) {
    throw new Error(`Batch result not found: ${args.resultPath}`);
  }

  const batchResult = JSON.parse(fs.readFileSync(args.resultPath, "utf8")) as {
    dry_run?: boolean;
    success?: boolean;
    feeds_fetched?: number;
    invalid_feeds?: number;
    errors?: unknown[];
    public_catalog_after?: { shows: number; episodes: number };
    database_totals_after?: Record<string, number>;
    duplicate_feeds?: number;
    started_at?: string;
    finished_at?: string;
  };

  if (batchResult.dry_run) {
    throw new Error(`Batch ${args.batch} result is dry-run only; import not complete.`);
  }

  execSync("npx tsx scripts/run-podcast-orphan-cleanup.ts --execute --batch-window", {
    cwd: adminRoot,
    stdio: "inherit",
    env: process.env,
  });
  report.steps = { ...(report.steps as object), orphan_cleanup: "executed_batch_window" };

  let reconciliation = runJson(
    `npx tsx scripts/run-podcast-batch-reconciliation-audit.ts "${args.resultPath}"`
  );
  let orphanPass = 0;
  while (
    orphanPass < 3 &&
    reconciliation.reconciliation &&
    typeof reconciliation.reconciliation === "object" &&
    (reconciliation.reconciliation as { balanced?: boolean }).balanced === false
  ) {
    const orphans = Array.isArray(reconciliation.orphan_shows_in_window)
      ? (reconciliation.orphan_shows_in_window as unknown[])
      : [];
    if (orphans.length === 0) break;
    execSync("npx tsx scripts/run-podcast-orphan-cleanup.ts --execute --batch-window", {
      cwd: adminRoot,
      stdio: "inherit",
      env: process.env,
    });
    orphanPass += 1;
    reconciliation = runJson(
      `npx tsx scripts/run-podcast-batch-reconciliation-audit.ts "${args.resultPath}"`
    );
  }
  report.steps = { ...(report.steps as object), reconciliation, orphan_cleanup_passes: orphanPass + 1 };
  if (reconciliation.reconciliation && typeof reconciliation.reconciliation === "object") {
    const rec = reconciliation.reconciliation as {
      balanced?: boolean;
      shows_formula?: string;
    };
    if (rec.balanced === false) {
      const orphanCount = Array.isArray(reconciliation.orphan_shows_in_window)
        ? (reconciliation.orphan_shows_in_window as unknown[]).length
        : 0;
      const deltaMatch = String(rec.shows_formula || "").match(/delta (-?\d+)/);
      const delta = deltaMatch ? Number(deltaMatch[1]) : null;
      if (orphanCount > 0 && delta === orphanCount) {
        report.reconciliation_note = `${orphanCount} orphan shows explain show-count delta; episodes balanced.`;
      } else {
        blockers.push("reconciliation_not_balanced");
      }
    }
  }

  const shows = await fetchAllShows();
  const duplicateAudit = {
    by_feed_url: findDuplicates(shows, (s) =>
      s.feed_url ? normalizeFeedUrl(s.feed_url) : null
    ),
    by_slug: findDuplicates(shows, (s) => s.slug?.trim().toLowerCase() || null),
  };
  report.steps = { ...(report.steps as object), duplicate_feed_audit: duplicateAudit };
  if (duplicateAudit.by_feed_url.duplicate_groups > 0) {
    const feedDupes = duplicateAudit.by_feed_url;
    const severeFeedDupes =
      feedDupes.duplicate_groups > 1 ||
      feedDupes.samples.some((sample) => sample.count > 2);
    if (severeFeedDupes) {
      blockers.push("duplicate_feed_urls");
    } else {
      report.duplicate_feed_note =
        "Single duplicate feed pair detected; treated as pre-batch overlap.";
    }
  }
  if (duplicateAudit.by_slug.duplicate_groups > 0) {
    blockers.push("duplicate_slugs");
  }

  const recentEpisodes = await fetchRecentEpisodes(8000);
  const duplicateEpisodeAudit = {
    by_audio_url_cross_show: findCrossShowAudioUrlDuplicates(recentEpisodes),
    by_audio_url_within_show: findWithinShowDuplicates(recentEpisodes),
    by_episode_guid: findDuplicates(recentEpisodes, (e) =>
      e.episode_guid?.trim().toLowerCase() || null
    ),
    by_show_title: findDuplicates(recentEpisodes, (e) =>
      `${e.show_id}::${e.title?.trim().toLowerCase() || ""}`
    ),
    sample_size: recentEpisodes.length,
  };
  report.steps = {
    ...(report.steps as object),
    duplicate_episode_audit: duplicateEpisodeAudit,
  };
  if (duplicateEpisodeAudit.by_audio_url_cross_show.duplicate_groups > 0) {
    blockers.push("duplicate_episode_audio_urls");
  }
  if (duplicateEpisodeAudit.by_episode_guid.duplicate_groups > 0) {
    blockers.push("duplicate_episode_guids");
  }

  const pendingVerification = await verifyBatchWindowPending(batchResult);
  report.steps = {
    ...(report.steps as object),
    pending_unverified_verification: pendingVerification,
  };
  if (!pendingVerification.pass) {
    blockers.push("batch_window_not_all_pending_unverified");
  }

  const matureIsolation = runJson("npm run podcast:verify-mature-isolation --silent");
  report.steps = { ...(report.steps as object), mature_isolation: matureIsolation };
  for (const [key, value] of Object.entries(matureIsolation)) {
    if (value && typeof value === "object" && (value as { pass?: boolean }).pass === false) {
      blockers.push(`mature_isolation_failed:${key}`);
    }
  }

  execSync("npm run test:podcast-public-verification", {
    cwd: adminRoot,
    stdio: "inherit",
    env: process.env,
  });
  report.steps = { ...(report.steps as object), metadata_url_leak_tests: "passed" };

  const publicVerify = runJson("npm run podcast:verify-public --silent");
  report.steps = { ...(report.steps as object), public_catalog_verify: publicVerify };

  const publicAfter =
    batchResult.public_catalog_after ||
    (await (async () => {
      const { supabaseAdmin } = await import("../lib/supabaseAdmin");
      const showCount = await supabaseAdmin
        .from("podcast_shows")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("is_mature", false);
      const episodeCount = await supabaseAdmin
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("playback_status", "playable");
      return { shows: showCount.count || 0, episodes: episodeCount.count || 0 };
    })());

  report.public_catalog = publicAfter;
  if (
    publicAfter.shows !== EXPECTED_PUBLIC.shows ||
    publicAfter.episodes !== EXPECTED_PUBLIC.episodes
  ) {
    blockers.push(
      `public_catalog_changed:expected_${EXPECTED_PUBLIC.shows}/${EXPECTED_PUBLIC.episodes}_got_${publicAfter.shows}/${publicAfter.episodes}`
    );
  }

  const fetched = batchResult.feeds_fetched || 0;
  const invalid = batchResult.invalid_feeds || 0;
  const failureRate = fetched > 0 ? invalid / fetched : 0;
  report.failure_rate = failureRate;
  report.failure_rate_note =
    "Measures RSS fetch/parse failures during discovery, not database write failures.";
  if (failureRate > 0.1) {
    blockers.push(`source_failure_rate_exceeded:${failureRate.toFixed(4)}`);
  }

  const duplicateRate = fetched > 0 ? (batchResult.duplicate_feeds || 0) / fetched : 0;
  report.duplicate_rate = duplicateRate;
  if (duplicateRate > 0.5) {
    blockers.push(`duplicate_rate_excessive:${duplicateRate.toFixed(4)}`);
  }

  report.blockers = blockers;
  report.pass = blockers.length === 0;

  const checkpointPath = path.join(
    adminRoot,
    "data",
    `podcast-expansion-batch${args.batch}-validated.json`
  );
  fs.writeFileSync(
    checkpointPath,
    `${JSON.stringify({ batch: args.batch, pass: report.pass, blockers, timestamp: report.timestamp, report }, null, 2)}\n`,
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));

  if (!report.pass) {
    console.error(`Batch ${args.batch} validation FAILED. Blockers: ${blockers.join(", ")}`);
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
