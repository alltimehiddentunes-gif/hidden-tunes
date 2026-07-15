import crypto from "node:crypto";

import { cleanText } from "@/lib/tvCatalog";

const DEFAULT_BASE_URL = "https://api.podcastindex.org/api/1.0";

export type PodcastIndexFeed = {
  id: number;
  title: string;
  url: string;
  originalUrl?: string;
  link?: string;
  description?: string;
  author?: string;
  ownerName?: string;
  image?: string;
  artwork?: string;
  language?: string;
  country?: string;
  explicit?: boolean;
  episodeCount?: number;
  categories?: Record<string, string>;
  newestItemPubdate?: number;
};

export type PodcastIndexSearchResult = {
  feeds: PodcastIndexFeed[];
  count: number;
  status?: string;
  description?: string;
};

function buildAuthHeaders() {
  const key = String(process.env.PODCASTINDEX_API_KEY || "").trim();
  const secret = String(process.env.PODCASTINDEX_API_SECRET || "").trim();
  if (!key || !secret) {
    throw new Error(
      "PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET are required for Podcast Index discovery."
    );
  }

  const epoch = Math.floor(Date.now() / 1000);
  const hash = crypto
    .createHash("sha1")
    .update(`${key}${secret}${epoch}`)
    .digest("hex");

  return {
    "User-Agent": "HiddenTunes-Podcast-Discovery/1.0",
    "X-Auth-Date": String(epoch),
    "X-Auth-Key": key,
    Authorization: hash,
  };
}

async function podcastIndexGet<T>(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${process.env.PODCASTINDEX_API_BASE_URL || DEFAULT_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: buildAuthHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    status?: string;
    description?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.description ||
        `Podcast Index request failed with HTTP ${response.status}.`
    );
  }

  return payload;
}

export async function searchPodcastIndexFeeds(options: {
  query?: string;
  lang?: string;
  max?: number;
  start?: number;
  category?: string;
}) {
  const payload = await podcastIndexGet<PodcastIndexSearchResult>("/podcasts/byterm", {
    q: cleanText(options.query, 120) || undefined,
    lang: cleanText(options.lang, 12) || undefined,
    max: Math.min(100, Math.max(1, Number(options.max || 25))),
    start: Math.max(0, Number(options.start || 0)),
    cat: cleanText(options.category, 80) || undefined,
  });

  return {
    feeds: payload.feeds || [],
    count: Number(payload.count || payload.feeds?.length || 0),
  };
}

export async function listRecentPodcastIndexFeeds(options: {
  lang?: string;
  max?: number;
  since?: number;
}) {
  const payload = await podcastIndexGet<{ feeds?: PodcastIndexFeed[]; count?: number }>(
    "/recent/feeds",
    {
      lang: cleanText(options.lang, 12) || undefined,
      max: Math.min(100, Math.max(1, Number(options.max || 25))),
      since: options.since,
    }
  );

  return {
    feeds: payload.feeds || [],
    count: Number(payload.count || payload.feeds?.length || 0),
  };
}

export async function getPodcastIndexFeedByUrl(feedUrl: string) {
  const payload = await podcastIndexGet<{ feed?: PodcastIndexFeed }>("/podcasts/byfeedurl", {
    url: cleanText(feedUrl, 2000) || undefined,
  });
  return payload.feed || null;
}

export function mapPodcastIndexFeedToIngestOptions(
  feed: PodcastIndexFeed,
  options?: { is_mature?: boolean; mature_category?: string | null; category_slug?: string }
) {
  return {
    source_type: "podcast_index",
    source_id: String(feed.id),
    source_feed_id: feed.id,
    country_code: cleanText(feed.country, 8) || undefined,
    category_slug: options?.category_slug || undefined,
    is_mature: options?.is_mature === true,
    mature_category: options?.mature_category || undefined,
  };
}
