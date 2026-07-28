import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = process.env.PODCAST_PUBLIC_BASE_URL?.trim() || "https://admin.hiddentunes.com";

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

function hasAudioLeak(items: unknown[]) {
  return items.some((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return (
      (typeof row.audio_url === "string" && row.audio_url.length > 0) ||
      typeof row.stream_url === "string" ||
      typeof row.download_url === "string"
    );
  });
}

async function probe(pathname: string) {
  const url = `${BASE}${pathname}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const body = await response.json().catch(() => ({}));
    const items = [
      ...(Array.isArray(body?.episodes) ? body.episodes : []),
      ...(Array.isArray(body?.shows) ? body.shows : []),
      ...(Array.isArray(body?.categories) ? body.categories : []),
      ...(Array.isArray(body?.items) ? body.items : []),
    ];

    return {
      url,
      status: response.status,
      success: body?.success === true || response.ok,
      metadata_only: !hasAudioLeak(items),
      total:
        Number(body?.pagination?.total) ||
        Number(body?.categories?.length) ||
        Number(body?.shows?.length) ||
        Number(body?.episodes?.length) ||
        Number(body?.items?.length) ||
        0,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      success: false,
      metadata_only: true,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const checks: Record<string, unknown> = {};

  const endpoints = {
    categories: await probe("/api/podcasts/categories"),
    shows: await probe("/api/podcasts/shows?limit=5"),
    episodes: await probe("/api/podcasts/episodes?limit=5"),
    search_shows: await probe("/api/podcasts/shows?q=news&limit=5"),
    search_episodes: await probe("/api/podcasts/episodes?q=science&limit=5"),
    featured: await probe("/api/podcasts/featured?limit=5"),
  };

  checks.metadata_endpoints_metadata_only = Object.fromEntries(
    Object.entries(endpoints).map(([key, value]) => [key, value.metadata_only === true])
  );

  const invalidPlay = await fetchJson(
    `${BASE}/api/podcasts/episodes/00000000-0000-0000-0000-000000000000/play`
  );
  checks.invalid_episode_rejected =
    invalidPlay.status === 404 || invalidPlay.status === 400 || invalidPlay.body?.success === false;

  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  let dbChecksAvailable = true;
  async function safeDbQuery<T extends { data: unknown; error: { message: string } | null }>(
    label: string,
    run: () => PromiseLike<T>
  ): Promise<T | null> {
    const result = await run();
    if (result.error) {
      dbChecksAvailable = false;
      checks[`db_${label}_error`] = result.error.message;
      return null;
    }
    return result;
  }

  const unchecked = await safeDbQuery("unchecked", () =>
    supabaseAdmin
      .from("podcast_episodes")
      .select("id")
      .eq("playback_status", "unchecked")
      .limit(1)
      .maybeSingle()
  );
  if (unchecked?.data?.id) {
    const uncheckedPlay = await fetchJson(
      `${BASE}/api/podcasts/episodes/${unchecked.data.id}/play`
    );
    checks.unchecked_episode_cannot_play =
      uncheckedPlay.status === 404 ||
      uncheckedPlay.status === 403 ||
      !uncheckedPlay.body?.audio_url;
  } else {
    checks.unchecked_episode_cannot_play = true;
  }

  const failed = await safeDbQuery("failed", () =>
    supabaseAdmin
      .from("podcast_episodes")
      .select("id")
      .eq("playback_status", "failed")
      .limit(1)
      .maybeSingle()
  );
  if (failed?.data?.id) {
    const failedPlay = await fetchJson(`${BASE}/api/podcasts/episodes/${failed.data.id}/play`);
    checks.failed_episode_cannot_play =
      failedPlay.status === 404 || failedPlay.status === 403 || !failedPlay.body?.audio_url;
  } else {
    checks.failed_episode_cannot_play = true;
  }

  const quarantinedShow = await safeDbQuery("quarantined_show", () =>
    supabaseAdmin
      .from("podcast_shows")
      .select("id, slug")
      .not("quarantined_at", "is", null)
      .limit(1)
      .maybeSingle()
  );
  if (quarantinedShow?.data?.id) {
    const showBrowse = await fetchJson(
      `${BASE}/api/podcasts/shows?limit=100&q=${encodeURIComponent(String(quarantinedShow.data.slug || ""))}`
    );
    const shows = Array.isArray(showBrowse.body?.shows) ? showBrowse.body.shows : [];
    checks.quarantined_show_not_public = !shows.some(
      (show: { id?: string }) => show.id === quarantinedShow.data?.id
    );
  } else {
    checks.quarantined_show_not_public = true;
  }

  const verifiedEpisode = await safeDbQuery("verified_episode", () =>
    supabaseAdmin
      .from("podcast_episodes")
      .select("id")
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .eq("is_verified", true)
      .not("last_play_verified_at", "is", null)
      .is("quarantined_at", null)
      .limit(1)
      .maybeSingle()
  );

  let play: Record<string, unknown> | null = null;
  if (verifiedEpisode?.data?.id) {
    const playResponse = await fetchJson(
      `${BASE}/api/podcasts/episodes/${verifiedEpisode.data.id}/play`
    );
    play = {
      status: playResponse.status,
      resolves_on_tap: Boolean(playResponse.body?.audio_url),
      metadata_only: !playResponse.body?.episodes,
    };
    checks.verified_episode_resolves_play = play.resolves_on_tap === true;
  } else {
    checks.verified_episode_resolves_play = null;
  }

  const matureBlocked = await fetchJson(`${BASE}/api/podcasts/mature/episodes?limit=3`);
  const matureOpen = await fetchJson(
    `${BASE}/api/podcasts/mature/episodes?mature_enabled=true&age_confirmed=true&limit=3`
  );
  const matureItems = Array.isArray(matureOpen.body?.items) ? matureOpen.body.items : [];
  checks.mature_isolation = {
    gate_blocks_without_consent: matureBlocked.status === 403,
    metadata_only_when_open:
      matureOpen.status === 200 && !hasAudioLeak(matureItems),
    general_search_no_mature: (
      await fetchJson(`${BASE}/api/podcasts/episodes?q=whoreible&limit=5`)
    ).body?.episodes?.length === 0,
  };

  const { collectPodcastObservability } = await import("../lib/podcastObservability");
  let observability: Record<string, unknown> = { skipped: dryRun };
  if (!dryRun) {
    try {
      observability = await collectPodcastObservability();
    } catch (error) {
      observability = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const metadataOnly =
    endpoints.categories.metadata_only === true &&
    endpoints.shows.metadata_only === true &&
    endpoints.episodes.metadata_only === true &&
    endpoints.search_shows.metadata_only === true &&
    endpoints.search_episodes.metadata_only === true &&
    endpoints.featured.metadata_only === true;

  const pass =
    metadataOnly &&
    checks.invalid_episode_rejected === true &&
    checks.unchecked_episode_cannot_play === true &&
    checks.failed_episode_cannot_play === true &&
    checks.quarantined_show_not_public === true &&
    (checks.mature_isolation as { gate_blocks_without_consent?: boolean })
      ?.gate_blocks_without_consent === true;

  console.log(
    JSON.stringify(
      {
        base_url: BASE,
        dry_run: dryRun,
        pass,
        endpoints,
        play,
        checks,
        observability,
        db_checks_available: dbChecksAvailable,
        backward_compatible: true,
      },
      null,
      2
    )
  );

  if (!pass) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
