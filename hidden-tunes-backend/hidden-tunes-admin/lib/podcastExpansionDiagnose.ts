import { normalizePodcastTitleKey } from "@/lib/podcastMetadataNormalize";
import { discoverPodcastFeedsForSource } from "@/lib/podcastMassExpansionDiscover";
import {
  hasPodcastIndexCredentials,
  loadPodcastSourceRegistry,
  type PodcastCatalogKind,
  type PodcastSourceRegistryEntry,
} from "@/lib/podcastSourceRegistry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

export type PodcastExpansionDiagnoseOptions = {
  source?: string;
  catalog?: PodcastCatalogKind;
  queries?: number;
  max_results?: number;
  admin_root?: string;
};

export type PodcastSourceDiagnostic = {
  source_key: string;
  source_name: string;
  catalog: PodcastCatalogKind;
  enabled: boolean;
  disabled_reason: string | null;
  queries_attempted: number;
  http_requests: number;
  successful_requests: number;
  failed_requests: number;
  raw_candidates: number;
  candidates_with_feed_urls: number;
  normalized_feed_urls: number;
  invalid_urls: number;
  existing_feed_duplicates: number;
  source_registry_duplicates: number;
  cross_source_duplicates: number;
  new_candidate_count: number;
  rate_limit_responses: number;
  timeouts: number;
  authentication_failures: number;
  other_failures: number;
  zero_result_reason:
    | "none"
    | "search_returned_no_results"
    | "results_lacked_feed_urls"
    | "all_feeds_already_in_database"
    | "all_feeds_already_in_registry"
    | "normalization_failed"
    | "search_request_failed"
    | "credentials_missing"
    | "source_disabled"
    | "source_exhausted"
    | null;
  sample_errors: string[];
  next_cursor: string | null;
  source_exhausted: boolean;
};

function normalizeFeedUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    }
    return url.toString().toLowerCase();
  } catch {
    return null;
  }
}

async function loadExistingFeedUrlSet(limitPages = 10) {
  const feedUrls = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  for (let page = 0; page < limitPages; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("feed_url, title, publisher")
      .not("feed_url", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const normalized = normalizeFeedUrl(String(row.feed_url || ""));
      if (normalized) feedUrls.add(normalized);
    }
    if ((data || []).length < pageSize) break;
    from += pageSize;
  }

  return feedUrls;
}

function sourceDisabledReason(source: PodcastSourceRegistryEntry) {
  if (!source.is_enabled) return "source disabled in registry";
  if (source.is_exhausted) return "source marked exhausted";
  if (source.source_kind === "podcast_index" && !hasPodcastIndexCredentials()) {
    return "required credentials are missing";
  }
  return null;
}

export async function diagnosePodcastExpansionSources(
  options: PodcastExpansionDiagnoseOptions = {}
): Promise<{
  generated_at: string;
  podcast_index_credentials_present: boolean;
  sources: PodcastSourceDiagnostic[];
}> {
  const adminRoot = options.admin_root || process.cwd();
  const maxResults = Math.max(1, Math.min(500, Number(options.max_results || 100)));
  const registry = loadPodcastSourceRegistry(adminRoot);
  const existingFeeds = await loadExistingFeedUrlSet();
  const seenAcrossSources = new Set<string>();

  const selected = options.source
    ? registry.filter((entry) => entry.source_key === options.source)
    : registry;

  const sources: PodcastSourceDiagnostic[] = [];

  for (const source of selected) {
    const disabledReason = sourceDisabledReason(source);
    const diagnostic: PodcastSourceDiagnostic = {
      source_key: source.source_key,
      source_name: source.source_name,
      catalog: source.catalog,
      enabled: disabledReason === null,
      disabled_reason: disabledReason,
      queries_attempted: 0,
      http_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      raw_candidates: 0,
      candidates_with_feed_urls: 0,
      normalized_feed_urls: 0,
      invalid_urls: 0,
      existing_feed_duplicates: 0,
      source_registry_duplicates: 0,
      cross_source_duplicates: 0,
      new_candidate_count: 0,
      rate_limit_responses: 0,
      timeouts: 0,
      authentication_failures: 0,
      other_failures: 0,
      zero_result_reason: null,
      sample_errors: [],
      next_cursor: source.checkpoint_cursor,
      source_exhausted: source.is_exhausted,
    };

    if (options.catalog && source.catalog !== options.catalog) {
      diagnostic.enabled = false;
      diagnostic.disabled_reason = `catalog filter ${options.catalog}`;
      diagnostic.zero_result_reason = "source_disabled";
      sources.push(diagnostic);
      continue;
    }

    if (disabledReason) {
      diagnostic.zero_result_reason =
        disabledReason === "required credentials are missing"
          ? "credentials_missing"
          : disabledReason === "source marked exhausted"
            ? "source_exhausted"
            : "source_disabled";
      sources.push(diagnostic);
      continue;
    }

    diagnostic.queries_attempted = 1;
    diagnostic.http_requests = 1;

    try {
      const discovery = await discoverPodcastFeedsForSource(source, maxResults);
      diagnostic.successful_requests = 1;
      diagnostic.raw_candidates = discovery.feeds.length;
      diagnostic.next_cursor = discovery.next_cursor;
      diagnostic.source_exhausted = discovery.exhausted;

      for (const feed of discovery.feeds) {
        const feedUrl = cleanText(feed.feedUrl, 2000) || "";
        if (!feedUrl) {
          diagnostic.invalid_urls += 1;
          continue;
        }
        diagnostic.candidates_with_feed_urls += 1;
        const normalized = normalizeFeedUrl(feedUrl);
        if (!normalized) {
          diagnostic.invalid_urls += 1;
          continue;
        }
        diagnostic.normalized_feed_urls += 1;

        if (existingFeeds.has(normalized)) {
          diagnostic.existing_feed_duplicates += 1;
          continue;
        }

        const titleKey = normalizePodcastTitleKey(feed.title);
        const publisher = cleanText(feed.publisher, 120)?.toLowerCase() || "";
        const titlePublisherKey = titleKey ? `${titleKey}::${publisher}` : "";
        if (titlePublisherKey && seenAcrossSources.has(titlePublisherKey)) {
          diagnostic.cross_source_duplicates += 1;
          continue;
        }

        if (seenAcrossSources.has(normalized)) {
          diagnostic.source_registry_duplicates += 1;
          continue;
        }

        seenAcrossSources.add(normalized);
        if (titlePublisherKey) seenAcrossSources.add(titlePublisherKey);
        diagnostic.new_candidate_count += 1;
      }

      if (discovery.feeds.length === 0) {
        diagnostic.zero_result_reason = discovery.exhausted
          ? "source_exhausted"
          : "search_returned_no_results";
      } else if (diagnostic.candidates_with_feed_urls === 0) {
        diagnostic.zero_result_reason = "results_lacked_feed_urls";
      } else if (diagnostic.new_candidate_count === 0) {
        diagnostic.zero_result_reason = "all_feeds_already_in_database";
      } else {
        diagnostic.zero_result_reason = "none";
      }
    } catch (error) {
      diagnostic.failed_requests = 1;
      const message = error instanceof Error ? error.message : String(error);
      diagnostic.sample_errors.push(message);
      if (/401|403|auth/i.test(message)) diagnostic.authentication_failures += 1;
      else if (/429|rate/i.test(message)) diagnostic.rate_limit_responses += 1;
      else if (/timed out|timeout|ETIMEDOUT/i.test(message)) diagnostic.timeouts += 1;
      else diagnostic.other_failures += 1;
      diagnostic.zero_result_reason = /401|403|auth/i.test(message)
        ? "credentials_missing"
        : "search_request_failed";
    }

    sources.push(diagnostic);
  }

  return {
    generated_at: new Date().toISOString(),
    podcast_index_credentials_present: hasPodcastIndexCredentials(),
    sources,
  };
}
