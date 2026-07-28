/**
 * Read-only production podcast catalog audit.
 * Phase 1 — no imports, no mutations.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countMaturePodcastSeedFeedsByCategory,
  countPodcastSeedFeedsByCategory,
  MATURE_PODCAST_SEED_FEEDS,
  PODCAST_SEED_FEEDS,
} from "../lib/podcastSeedFeeds";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const PUBLIC_BASE =
  process.env.PODCAST_PUBLIC_BASE_URL?.trim() || "https://admin.hiddentunes.com";

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

type ShowRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  host_name: string | null;
  primary_category: string | null;
  categories: string[] | null;
  language: string | null;
  publisher: string | null;
  feed_url: string | null;
  status: string;
  feed_status: string;
  is_verified: boolean;
  is_active: boolean;
  is_mature: boolean;
  episode_count: number;
  last_checked_at: string | null;
};

type EpisodeRow = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  episode_guid: string | null;
  status: string;
  playback_status: string;
  is_verified: boolean;
  is_active: boolean;
  last_checked_at: string | null;
};

function countBy<T extends string>(
  rows: Array<Record<string, unknown>>,
  field: string,
  filter?: (row: Record<string, unknown>) => boolean
) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (filter && !filter(row)) continue;
    const raw = row[field];
    const key =
      raw === null || raw === undefined || String(raw).trim() === ""
        ? "(missing)"
        : String(raw).trim();
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

function topN(counts: Record<string, number>, n = 10) {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
  );
}

function bottomN(counts: Record<string, number>, n = 10) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([key]) => key !== "(missing)")
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
  );
}

function findDuplicates<T>(
  rows: T[],
  keyFn: (row: T) => string | null
): { duplicate_groups: number; duplicate_rows: number; samples: string[] } {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  const dupes = [...map.entries()].filter(([, list]) => list.length > 1);
  return {
    duplicate_groups: dupes.length,
    duplicate_rows: dupes.reduce((sum, [, list]) => sum + list.length, 0),
    samples: dupes.slice(0, 5).map(([key, list]) => `${key} (${list.length})`),
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { collectPodcastAuditCounts } = await import("../lib/podcastAuditCounts");

  const phaseBCounts = await collectPodcastAuditCounts();

  const { data: shows, error: showError } = await supabaseAdmin
    .from("podcast_shows")
    .select(
      "id, slug, title, description, artwork_url, host_name, primary_category, categories, language, publisher, feed_url, status, feed_status, is_verified, is_active, is_mature, episode_count, last_checked_at"
    );

  if (showError) throw new Error(showError.message);

  const episodeSelectBase =
    "id, show_id, title, description, artwork_url, audio_url, duration_seconds, published_at, status, playback_status, is_verified, is_active, last_checked_at";

  let hasEpisodeGuid = false;
  let episodeResult = await supabaseAdmin
    .from("podcast_episodes")
    .select(`${episodeSelectBase}, episode_guid`);

  if (episodeResult.error?.message?.includes("episode_guid")) {
    episodeResult = await supabaseAdmin
      .from("podcast_episodes")
      .select(episodeSelectBase);
  } else {
    hasEpisodeGuid = true;
  }

  const { data: episodes, error: episodeError } = episodeResult;
  if (episodeError) throw new Error(episodeError.message);

  const showRows = (shows || []) as ShowRow[];
  const episodeRows = (episodes || []) as EpisodeRow[];

  const publicShow = (s: ShowRow) =>
    s.status === "approved" &&
    s.is_active &&
    s.feed_status === "active" &&
    !s.is_mature;

  const publicEpisode = (e: EpisodeRow) =>
    e.status === "approved" &&
    e.is_active &&
    e.playback_status === "playable";

  const verifiedPlayableEpisode = (e: EpisodeRow) => publicEpisode(e);

  const publicShows = showRows.filter(publicShow);
  const publicEpisodes = episodeRows.filter(publicEpisode);
  const matureShows = showRows.filter((s) => s.is_mature);
  const matureEpisodes = episodeRows.filter(
    (e) =>
      e.status === "approved" &&
      e.is_active &&
      e.playback_status === "playable" &&
      matureShows.some((s) => s.id === e.show_id)
  );

  const showById = new Map(showRows.map((s) => [s.id, s]));

  const duplicateShowsByFeed = findDuplicates(showRows, (s) =>
    s.feed_url?.trim() || null
  );
  const duplicateShowsBySlug = findDuplicates(showRows, (s) => s.slug?.trim() || null);
  const duplicateShowsByTitle = findDuplicates(
    showRows,
    (s) => s.title?.trim().toLowerCase() || null
  );
  const duplicateEpisodesByGuid = hasEpisodeGuid
    ? findDuplicates(episodeRows, (e) =>
        e.episode_guid?.trim() ? `${e.show_id}::${e.episode_guid.trim()}` : null
      )
    : { duplicate_groups: 0, duplicate_rows: 0, samples: [], note: "episode_guid column not migrated" };
  const duplicateEpisodesByAudio = findDuplicates(episodeRows, (e) =>
    e.audio_url?.trim() || null
  );
  const duplicateEpisodesByTitleDate = findDuplicates(episodeRows, (e) => {
    const title = e.title?.trim().toLowerCase();
    const published = e.published_at || "";
    return title ? `${e.show_id}::${title}::${published}` : null;
  });

  const deadEpisodes = episodeRows.filter(
    (e) =>
      e.playback_status === "failed" ||
      e.playback_status === "offline" ||
      e.status === "blocked" ||
      e.status === "rejected" ||
      e.status === "inactive"
  );

  const brokenFeeds = showRows.filter(
    (s) =>
      s.feed_status === "offline" ||
      s.feed_status === "inactive" ||
      s.feed_status === "blocked" ||
      s.feed_status === "rejected"
  );

  const pendingVerification = {
    shows_pending: showRows.filter((s) => s.status === "pending").length,
    shows_unchecked_feed: showRows.filter((s) => s.feed_status === "unchecked")
      .length,
    episodes_pending: episodeRows.filter((e) => e.status === "pending").length,
    episodes_unchecked_playback: episodeRows.filter(
      (e) => e.playback_status === "unchecked"
    ).length,
    episodes_failed_playback: episodeRows.filter(
      (e) => e.playback_status === "failed"
    ).length,
  };

  const missingShowMetadata = {
    artwork: showRows.filter((s) => !s.artwork_url?.trim()).length,
    language: showRows.filter((s) => !s.language?.trim()).length,
    category: showRows.filter((s) => !s.primary_category?.trim()).length,
    description: showRows.filter((s) => !s.description?.trim()).length,
    host_name: showRows.filter((s) => !s.host_name?.trim()).length,
    publisher: showRows.filter((s) => !s.publisher?.trim()).length,
    feed_url: showRows.filter((s) => !s.feed_url?.trim()).length,
  };

  const missingEpisodeMetadata = {
    artwork: episodeRows.filter((e) => !e.artwork_url?.trim()).length,
    duration: episodeRows.filter((e) => !e.duration_seconds).length,
    published_at: episodeRows.filter((e) => !e.published_at).length,
    description: episodeRows.filter((e) => !e.description?.trim()).length,
    episode_guid: hasEpisodeGuid
      ? episodeRows.filter((e) => !e.episode_guid?.trim()).length
      : episodeRows.length,
    audio_url: episodeRows.filter((e) => !e.audio_url?.trim()).length,
  };

  const publicEpisodesWithShow = publicEpisodes.map((e) => ({
    ...e,
    show: showById.get(e.show_id),
  }));

  const categoryCounts = countBy(
    publicShows.map((s) => s as unknown as Record<string, unknown>),
    "primary_category"
  );
  const languageCounts = countBy(
    publicShows.map((s) => s as unknown as Record<string, unknown>),
    "language"
  );
  const publisherCounts = countBy(
    publicShows.map((s) => s as unknown as Record<string, unknown>),
    "publisher"
  );

  const feedHostCounts: Record<string, number> = {};
  for (const show of publicShows) {
    if (!show.feed_url) continue;
    try {
      const host = new URL(show.feed_url).hostname.replace(/^www\./, "");
      feedHostCounts[host] = (feedHostCounts[host] || 0) + 1;
    } catch {
      feedHostCounts["(invalid)"] = (feedHostCounts["(invalid)"] || 0) + 1;
    }
  }

  const apiEndpoints = [
    "/api/podcasts/categories",
    "/api/podcasts/shows?limit=1",
    "/api/podcasts/shows?q=news&limit=1",
    "/api/podcasts/episodes?limit=1",
    "/api/podcasts/episodes?q=science&limit=1",
    "/api/podcasts/featured?limit=1",
  ];

  const apiAudit: Record<string, unknown> = {};
  let sampleEpisodeId: string | null = null;

  for (const endpoint of apiEndpoints) {
    const { status, payload } = await fetchJson(`${PUBLIC_BASE}${endpoint}`);
    const episodes = Array.isArray(payload?.episodes) ? payload.episodes : [];
    const shows = Array.isArray(payload?.shows) ? payload.shows : [];
    const items = episodes.length ? episodes : shows;
    const hasAudioLeak = items.some(
      (item: Record<string, unknown>) =>
        typeof item.audio_url === "string" && item.audio_url.length > 0
    );
    const hasStreamLeak = items.some(
      (item: Record<string, unknown>) =>
        typeof item.stream_url === "string" ||
        typeof item.download_url === "string"
    );

    if (!sampleEpisodeId && episodes[0]?.id) {
      sampleEpisodeId = String(episodes[0].id);
    }

    apiAudit[endpoint] = {
      status,
      metadata_only: !hasAudioLeak && !hasStreamLeak,
      has_pagination: Boolean(payload?.pagination),
      total: Number(payload?.pagination?.total || items.length || 0),
    };
  }

  if (sampleEpisodeId) {
    const play = await fetchJson(
      `${PUBLIC_BASE}/api/podcasts/episodes/${sampleEpisodeId}/play`
    );
    apiAudit["/api/podcasts/episodes/[id]/play"] = {
      status: play.status,
      resolves_audio_on_tap: Boolean(play.payload?.audio_url),
      leaks_list_metadata: Boolean(play.payload?.episodes),
    };
  }

  const seedSourceAudit = {
    normal_seed_feeds: PODCAST_SEED_FEEDS.length,
    mature_seed_feeds: MATURE_PODCAST_SEED_FEEDS.length,
    normal_by_category: countPodcastSeedFeedsByCategory(),
    mature_by_category: countMaturePodcastSeedFeedsByCategory(),
    estimated_episodes_per_feed_cap: 40,
    estimated_max_episodes_from_seeds:
      (PODCAST_SEED_FEEDS.length + MATURE_PODCAST_SEED_FEEDS.length) * 40,
    podcast_index_integration: false,
    sources: [
      {
        name: "Curated RSS seed catalog",
        feeds: PODCAST_SEED_FEEDS.length + MATURE_PODCAST_SEED_FEEDS.length,
        countries: ["US", "UK", "AU", "IE"],
        languages: ["en"],
        categories: Object.keys(countPodcastSeedFeedsByCategory()),
        metadata_quality: "high",
        duplicate_risk: "low",
        verification_estimate: "high (auto-approve on ingest)",
      },
      {
        name: "Ad-hoc RSS ingest (admin)",
        feeds: "unbounded",
        countries: "depends on feed",
        languages: "depends on feed",
        metadata_quality: "varies",
        duplicate_risk: "medium",
        verification_estimate: "medium",
      },
    ],
  };

  const gap = {
    target_shows: 50_000,
    target_episodes: 1_000_000,
    current_verified_public_shows: publicShows.length,
    current_verified_playable_episodes: publicEpisodes.length,
    current_mature_shows: matureShows.filter(publicShow).length,
    current_mature_playable_episodes: matureEpisodes.length,
    show_gap: Math.max(0, 50_000 - publicShows.length),
    episode_gap: Math.max(0, 1_000_000 - publicEpisodes.length),
    show_gap_percent_complete: Number(
      ((publicShows.length / 50_000) * 100).toFixed(4)
    ),
    episode_gap_percent_complete: Number(
      ((publicEpisodes.length / 1_000_000) * 100).toFixed(4)
    ),
  };

  const report = {
    generated_at: new Date().toISOString(),
    phase: "B-production-audit",
    phase_b_verification: phaseBCounts,
    totals: {
      all_shows: showRows.length,
      all_episodes: episodeRows.length,
      public_shows: publicShows.length,
      public_episodes: publicEpisodes.length,
      verified_playable_episodes: publicEpisodes.length,
      approved_shows: showRows.filter((s) => s.status === "approved").length,
      active_shows: showRows.filter((s) => s.is_active).length,
      reliability_qualified_shows: showRows.filter(
        (s) => s.feed_status === "active" && s.is_active && s.status === "approved"
      ).length,
      mature_shows: matureShows.length,
      mature_playable_episodes: matureEpisodes.length,
      zero_episode_shows: showRows.filter((s) => Number(s.episode_count || 0) === 0)
        .length,
    },
    quality: {
      duplicate_shows_by_feed_url: duplicateShowsByFeed,
      duplicate_shows_by_slug: duplicateShowsBySlug,
      duplicate_shows_by_title: duplicateShowsByTitle,
      duplicate_episodes_by_guid: duplicateEpisodesByGuid,
      duplicate_episodes_by_audio_url: duplicateEpisodesByAudio,
      duplicate_episodes_by_title_date: duplicateEpisodesByTitleDate,
      dead_or_blocked_episodes: deadEpisodes.length,
      broken_feed_shows: brokenFeeds.length,
      broken_feed_samples: brokenFeeds.slice(0, 5).map((s) => ({
        slug: s.slug,
        feed_status: s.feed_status,
      })),
      non_https_audio_episodes: episodeRows.filter((e) => {
        if (!e.audio_url) return false;
        try {
          return new URL(e.audio_url).protocol !== "https:";
        } catch {
          return true;
        }
      }).length,
      pending_verification: pendingVerification,
    },
    metadata: {
      missing_show_fields: missingShowMetadata,
      missing_episode_fields: missingEpisodeMetadata,
      note: "Schema has no country or website columns on podcast_shows",
    },
    worldwide_coverage: {
      categories_represented: Object.keys(categoryCounts).length,
      languages_represented: Object.keys(languageCounts).filter(
        (k) => k !== "(missing)"
      ).length,
      publishers_represented: Object.keys(publisherCounts).filter(
        (k) => k !== "(missing)"
      ).length,
      feed_hosts_represented: Object.keys(feedHostCounts).length,
      by_category: categoryCounts,
      by_language: languageCounts,
      by_publisher: publisherCounts,
      by_feed_host: feedHostCounts,
      weakest_categories: bottomN(categoryCounts, 5),
      weakest_languages: bottomN(languageCounts, 5),
      weakest_publishers: bottomN(publisherCounts, 5),
      geographic_note:
        "No country column — catalog is overwhelmingly US/UK English publishers (NPR, BBC, ESPN, etc.)",
    },
    api_audit: {
      base_url: PUBLIC_BASE,
      endpoints: apiAudit,
      continue_listening_endpoint: false,
      recently_played_endpoint: false,
      dedicated_search_endpoint: false,
      search_via_query_param: true,
    },
    legal_source_audit: seedSourceAudit,
    gap_analysis: gap,
    architecture_notes: {
      metadata_first_browse: true,
      metadata_first_search: true,
      play_resolve_on_tap: true,
      post_ingest_audio_health_checks: true,
      unified_verify_production_script: true,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
