import { XMLParser } from "fast-xml-parser";

import {
  PODCAST_MAX_INGEST_EPISODES,
  slugifyPodcast,
  validatePodcastFeedUrl,
} from "@/lib/podcastAdminCatalog";
import {
  evaluatePodcastEpisodeAutoApproval,
  evaluatePodcastFeedAutoApproval,
  resolveEpisodeLifecycleFields,
  resolveShowLifecycleFields,
} from "@/lib/podcastAutoApproval";
import type {
  ParsedPodcastEpisode,
  ParsedPodcastFeed,
  PodcastIngestOptions,
  PodcastIngestResult,
} from "@/lib/podcastIngestTypes";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type {
  ParsedPodcastEpisode,
  ParsedPodcastFeed,
  PodcastIngestOptions,
  PodcastIngestResult,
} from "@/lib/podcastIngestTypes";

const FEED_FETCH_TIMEOUT_MS = 20_000;
const FEED_USER_AGENT = "HiddenTunes-Podcast-Ingest/1.0";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value: unknown) {
  const text = cleanText(value, 4000);
  if (!text) return null;
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function parseDurationSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const text = cleanText(value, 40);
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);

  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return null;
}

function parsePublishedAt(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return null;

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;

  return new Date(parsed).toISOString();
}

function normalizeHttpUrl(value: unknown) {
  const text = cleanText(value, 2000);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractRssImage(channel: Record<string, unknown>) {
  const image = channel.image as Record<string, unknown> | string | undefined;
  if (typeof image === "string") return normalizeHttpUrl(image);
  if (image && typeof image === "object") {
    return normalizeHttpUrl(image.url || image["@_href"]);
  }

  const itunesImage = channel["itunes:image"];
  if (itunesImage && typeof itunesImage === "object") {
    return normalizeHttpUrl((itunesImage as Record<string, unknown>)["@_href"]);
  }

  return normalizeHttpUrl(itunesImage);
}

function extractCategories(channel: Record<string, unknown>) {
  const categories = new Set<string>();
  const rawCategories = asArray(channel.category).concat(
    asArray(channel["itunes:category"])
  );

  for (const entry of rawCategories) {
    if (typeof entry === "string") {
      const cleaned = cleanText(entry, 120);
      if (cleaned) categories.add(cleaned);
      continue;
    }

    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const text = cleanText(record["@_text"] || record["#text"] || record.text, 120);
      if (text) categories.add(text);

      const nested = asArray(record["itunes:category"]);
      for (const nestedEntry of nested) {
        if (nestedEntry && typeof nestedEntry === "object") {
          const nestedRecord = nestedEntry as Record<string, unknown>;
          const nestedText = cleanText(
            nestedRecord["@_text"] || nestedRecord["#text"],
            120
          );
          if (nestedText) categories.add(nestedText);
        }
      }
    }
  }

  return Array.from(categories);
}

function extractEpisodeGuid(item: Record<string, unknown>) {
  const guid = item.guid;
  if (typeof guid === "string") {
    return cleanText(guid, 500);
  }
  if (guid && typeof guid === "object") {
    const record = guid as Record<string, unknown>;
    return cleanText(record["#text"] || record.text, 500);
  }
  return cleanText(item.id, 500);
}

function extractEpisodeAudioUrl(item: Record<string, unknown>) {
  const enclosures = asArray(item.enclosure);
  for (const enclosure of enclosures) {
    if (!enclosure || typeof enclosure !== "object") continue;
    const record = enclosure as Record<string, unknown>;
    const url = normalizeHttpUrl(record["@_url"]);
    const type = cleanText(record["@_type"], 80)?.toLowerCase() || "";
    if (url && (!type || type.startsWith("audio/"))) {
      return url;
    }
  }

  const mediaGroup = item["media:group"];
  const mediaContents = asArray(item["media:content"]).concat(
    mediaGroup && typeof mediaGroup === "object"
      ? asArray((mediaGroup as Record<string, unknown>)["media:content"])
      : []
  );

  for (const media of mediaContents) {
    if (!media || typeof media !== "object") continue;
    const record = media as Record<string, unknown>;
    const url = normalizeHttpUrl(record["@_url"]);
    const type = cleanText(record["@_type"], 80)?.toLowerCase() || "";
    if (url && (!type || type.startsWith("audio/"))) {
      return url;
    }
  }

  return null;
}

function parseRssChannel(channel: Record<string, unknown>): ParsedPodcastFeed {
  const title = cleanText(channel.title, 300);
  if (!title) {
    throw new Error("RSS feed is missing a channel title.");
  }

  const categories = extractCategories(channel);
  const episodes: ParsedPodcastEpisode[] = [];

  for (const item of asArray(channel.item)) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const episodeTitle = cleanText(record.title, 300);
    const audioUrl = extractEpisodeAudioUrl(record);

    if (!episodeTitle || !audioUrl) continue;

    const itunesImage = record["itunes:image"];
    let episodeArtwork: string | null = null;
    if (itunesImage && typeof itunesImage === "object") {
      episodeArtwork = normalizeHttpUrl(
        (itunesImage as Record<string, unknown>)["@_href"]
      );
    } else {
      episodeArtwork = normalizeHttpUrl(itunesImage);
    }

    episodes.push({
      title: episodeTitle,
      description:
        stripHtml(record["content:encoded"]) ||
        stripHtml(record.description) ||
        stripHtml(record["itunes:summary"]),
      artwork_url: episodeArtwork,
      audio_url: audioUrl,
      duration_seconds: parseDurationSeconds(record["itunes:duration"]),
      published_at: parsePublishedAt(record.pubDate || record.published),
      episode_number: Number.isFinite(Number(record["itunes:episode"]))
        ? Number(record["itunes:episode"])
        : null,
      season_number: Number.isFinite(Number(record["itunes:season"]))
        ? Number(record["itunes:season"])
        : null,
      guid: extractEpisodeGuid(record),
    });
  }

  if (episodes.length === 0) {
    throw new Error("RSS feed contains no playable podcast episodes.");
  }

  return {
    title,
    description:
      stripHtml(channel.description) || stripHtml(channel["itunes:summary"]),
    artwork_url: extractRssImage(channel),
    host_name:
      cleanText(channel["itunes:author"], 120) ||
      cleanText(channel["dc:creator"], 120),
    publisher:
      cleanText(
        (channel["itunes:owner"] as Record<string, unknown> | undefined)?.[
          "itunes:name"
        ],
        160
      ) ||
      cleanText(channel.managingEditor, 160) ||
      cleanText(channel["itunes:author"], 160),
    language: cleanText(channel.language, 40),
    primary_category: categories[0] || null,
    categories,
    episodes: episodes.slice(0, PODCAST_MAX_INGEST_EPISODES),
  };
}

function parseAtomFeed(feed: Record<string, unknown>): ParsedPodcastFeed {
  const title = cleanText(feed.title, 300);
  if (!title) {
    throw new Error("Atom feed is missing a title.");
  }

  const episodes: ParsedPodcastEpisode[] = [];

  for (const entry of asArray(feed.entry)) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const episodeTitle = cleanText(record.title, 300);
    if (!episodeTitle) continue;

    let audioUrl: string | null = null;
    for (const link of asArray(record.link)) {
      if (!link || typeof link !== "object") continue;
      const linkRecord = link as Record<string, unknown>;
      const rel = cleanText(linkRecord["@_rel"], 40)?.toLowerCase() || "";
      const type = cleanText(linkRecord["@_type"], 80)?.toLowerCase() || "";
      const href = normalizeHttpUrl(linkRecord["@_href"]);
      if (!href) continue;
      if (rel === "enclosure" || type.startsWith("audio/")) {
        audioUrl = href;
        break;
      }
    }

    if (!audioUrl) continue;

    episodes.push({
      title: episodeTitle,
      description: stripHtml(record.summary) || stripHtml(record.content),
      artwork_url: null,
      audio_url: audioUrl,
      duration_seconds: null,
      published_at: parsePublishedAt(record.published || record.updated),
      episode_number: null,
      season_number: null,
      guid: cleanText(record.id, 500),
    });
  }

  if (episodes.length === 0) {
    throw new Error("Atom feed contains no playable podcast episodes.");
  }

  const author = feed.author;
  const authorName =
    author && typeof author === "object"
      ? cleanText((author as Record<string, unknown>).name, 120)
      : null;

  return {
    title,
    description: stripHtml(feed.subtitle) || stripHtml(feed.summary),
    artwork_url: normalizeHttpUrl(feed.logo) || normalizeHttpUrl(feed.icon),
    host_name: authorName,
    publisher: authorName,
    language: cleanText(feed["@_xml:lang"], 40),
    primary_category: null,
    categories: [],
    episodes: episodes.slice(0, PODCAST_MAX_INGEST_EPISODES),
  };
}

export function parsePodcastFeedXml(xml: string): ParsedPodcastFeed {
  const trimmed = String(xml || "").trim();
  if (!trimmed) {
    throw new Error("Feed response was empty.");
  }

  const lower = trimmed.slice(0, 200).toLowerCase();
  if (!lower.includes("<rss") && !lower.includes("<feed")) {
    throw new Error("Response is not a valid RSS or Atom feed.");
  }

  const parsed = xmlParser.parse(trimmed) as Record<string, unknown>;

  if (parsed.rss && typeof parsed.rss === "object") {
    const rss = parsed.rss as Record<string, unknown>;
    const channel = rss.channel as Record<string, unknown> | undefined;
    if (!channel || typeof channel !== "object") {
      throw new Error("RSS feed is missing a channel.");
    }
    return parseRssChannel(channel);
  }

  if (parsed.feed && typeof parsed.feed === "object") {
    return parseAtomFeed(parsed.feed as Record<string, unknown>);
  }

  throw new Error("Unsupported feed format.");
}

export async function fetchPodcastFeedXml(
  feedUrl: string,
  timeoutMs = FEED_FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(feedUrl, {
      method: "GET",
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": FEED_USER_AGENT,
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}.`);
    }

    const contentType = cleanText(response.headers.get("content-type"), 120) || "";
    if (
      contentType &&
      !/xml|rss|atom/i.test(contentType) &&
      !/text\/plain/i.test(contentType)
    ) {
      throw new Error("Feed URL did not return XML content.");
    }

    const body = await response.text();
    if (!body.trim()) {
      throw new Error("Feed response was empty.");
    }

    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Feed request timed out.");
    }

    throw error instanceof Error ? error : new Error("Feed request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureUniqueShowSlug(baseTitle: string) {
  const baseSlug = slugifyPodcast(baseTitle);
  let candidate = baseSlug;
  let suffix = 2;

  while (suffix < 100) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  throw new Error("Could not generate a unique show slug.");
}

async function loadExistingEpisodes(showId: string) {
  const selectWithGuid =
    "id, audio_url, episode_guid, title, published_at, status, playback_status, is_active, is_verified";
  const selectFallback =
    "id, audio_url, title, published_at, status, playback_status, is_active, is_verified";

  let data: Record<string, unknown>[] | null = null;
  let errorMessage = "";

  const primary = await supabaseAdmin
    .from("podcast_episodes")
    .select(selectWithGuid)
    .eq("show_id", showId);

  if (primary.error) {
    errorMessage = primary.error.message;
    const fallback = await supabaseAdmin
      .from("podcast_episodes")
      .select(selectFallback)
      .eq("show_id", showId);

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    data = (fallback.data || []) as Record<string, unknown>[];
  } else {
    data = (primary.data || []) as Record<string, unknown>[];
  }

  void errorMessage;

  const byAudioUrl = new Map<string, Record<string, unknown>>();
  const byGuid = new Map<string, Record<string, unknown>>();
  const byTitlePublished = new Map<string, Record<string, unknown>>();

  for (const row of data || []) {
    const record = row as Record<string, unknown>;
    const audioUrl = cleanText(record.audio_url, 2000);
    const guid = cleanText(record.episode_guid, 500);
    const title = cleanText(record.title, 300)?.toLowerCase() || "";
    const publishedAt = cleanText(record.published_at, 40) || "";

    if (audioUrl) byAudioUrl.set(audioUrl, record);
    if (guid) byGuid.set(guid, record);
    if (title) {
      byTitlePublished.set(`${title}|${publishedAt}`, record);
    }
  }

  return { byAudioUrl, byGuid, byTitlePublished };
}

function findExistingEpisode(
  maps: Awaited<ReturnType<typeof loadExistingEpisodes>>,
  episode: ParsedPodcastEpisode
) {
  const guid = cleanText(episode.guid, 500);
  if (guid && maps.byGuid.has(guid)) {
    return maps.byGuid.get(guid) || null;
  }

  const audioUrl = cleanText(episode.audio_url, 2000);
  if (audioUrl && maps.byAudioUrl.has(audioUrl)) {
    return maps.byAudioUrl.get(audioUrl) || null;
  }

  const title = cleanText(episode.title, 300)?.toLowerCase() || "";
  const publishedAt = cleanText(episode.published_at, 40) || "";
  if (title) {
    return maps.byTitlePublished.get(`${title}|${publishedAt}`) || null;
  }

  return null;
}

function parseAutoApprove(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isMissingEpisodeGuidColumnError(message: string) {
  return /episode_guid/i.test(message) && /does not exist|column/i.test(message);
}

function isMissingMatureCategoryColumnError(message: string) {
  return /mature_category/i.test(message) && /does not exist|column/i.test(message);
}

function stripEpisodeGuid(metadata: Record<string, unknown>) {
  const next = { ...metadata };
  delete next.episode_guid;
  return next;
}

function stripMatureCategory(metadata: Record<string, unknown>) {
  const next = { ...metadata };
  delete next.mature_category;
  return next;
}

function shouldPreserveShowModeration(
  existing:
    | {
        status?: string | null;
        is_active?: boolean | null;
      }
    | null
    | undefined,
  autoApprove: boolean
) {
  if (!existing) return false;
  if (!autoApprove) return true;
  if (existing.status === "rejected" || existing.status === "blocked") {
    return true;
  }
  if (existing.status === "approved" && existing.is_active) {
    return true;
  }
  return false;
}

function shouldPreserveEpisodeModeration(
  existing:
    | {
        status?: string | null;
        is_active?: boolean | null;
      }
    | null
    | undefined,
  autoApprove: boolean
) {
  if (!existing) return false;
  if (!autoApprove) return true;
  if (existing.status === "rejected" || existing.status === "blocked") {
    return true;
  }
  if (existing.status === "approved" && existing.is_active) {
    return true;
  }
  return false;
}

function countEpisodeOutcome(
  lifecycle: {
    status: string;
    playback_status: string;
    is_active: boolean;
  },
  counters: {
    episodes_auto_approved: number;
    episodes_pending: number;
    episodes_failed: number;
  }
) {
  if (
    lifecycle.status === "approved" &&
    lifecycle.is_active &&
    lifecycle.playback_status === "playable"
  ) {
    counters.episodes_auto_approved += 1;
    return;
  }

  if (lifecycle.playback_status === "failed") {
    counters.episodes_failed += 1;
    return;
  }

  counters.episodes_pending += 1;
}

export async function ingestPodcastFeed(
  feedUrlInput: unknown,
  options: PodcastIngestOptions = {}
): Promise<PodcastIngestResult> {
  const autoApprove = parseAutoApprove(options.auto_approve);
  const isMature = options.is_mature === true;
  const matureCategory = isMature ? cleanText(options.mature_category, 120) : null;
  const feedUrl = validatePodcastFeedUrl(feedUrlInput);
  if (!feedUrl) {
    throw new Error("A valid http(s) RSS feed URL is required.");
  }

  const xml = await fetchPodcastFeedXml(
    feedUrl,
    options.feed_timeout_ms || FEED_FETCH_TIMEOUT_MS
  );
  const parsed = parsePodcastFeedXml(xml);

  const maxEpisodes = Math.min(
    PODCAST_MAX_INGEST_EPISODES,
    Math.max(1, Number(options.max_episodes || PODCAST_MAX_INGEST_EPISODES))
  );
  parsed.episodes = parsed.episodes.slice(0, maxEpisodes);

  if (options.category_slug) {
    const categorySlug = cleanText(options.category_slug, 120);
    if (categorySlug) {
      parsed.primary_category = categorySlug;
      parsed.categories = Array.from(
        new Set([categorySlug, ...parsed.categories])
      ).slice(0, 8);
    }
  }

  if (isMature && matureCategory) {
    parsed.categories = Array.from(
      new Set([matureCategory, ...parsed.categories])
    ).slice(0, 12);
  }

  const autoApproval = evaluatePodcastFeedAutoApproval(parsed, feedUrl);
  const now = new Date().toISOString();

  const { data: existingShowRow, error: existingShowError } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, slug, status, feed_status, is_active")
    .eq("feed_url", feedUrl)
    .maybeSingle();

  if (existingShowError) {
    throw new Error(existingShowError.message);
  }

  let existingShow = existingShowRow;
  let showId = String(existingShowRow?.id || "");

  if (!showId) {
    const preferredSlug = cleanText(options.show_slug, 80);
    if (preferredSlug) {
      const { data: slugMatch, error: slugError } = await supabaseAdmin
        .from("podcast_shows")
        .select("id, slug, status, feed_status, is_active")
        .eq("slug", preferredSlug)
        .maybeSingle();

      if (slugError) {
        throw new Error(slugError.message);
      }

      if (slugMatch?.id) {
        existingShow = slugMatch;
        showId = String(slugMatch.id);
      }
    }
  }

  let createdShow = false;
  const preserveShowModeration = shouldPreserveShowModeration(existingShow, autoApprove);

  const showLifecycle = resolveShowLifecycleFields(
    autoApproval.show,
    autoApprove,
    preserveShowModeration,
    existingShow as
      | {
          status?: string | null;
          feed_status?: string | null;
          is_active?: boolean | null;
        }
      | undefined
  );

  const showIsApprovedForEpisodes =
    showLifecycle.status === "approved" &&
    showLifecycle.is_active &&
    showLifecycle.feed_status === "active";

  const showMetadata: Record<string, unknown> = {
    title: parsed.title,
    description: parsed.description,
    artwork_url: parsed.artwork_url,
    host_name: parsed.host_name,
    publisher: parsed.publisher,
    language: parsed.language,
    primary_category: parsed.primary_category,
    categories: parsed.categories,
    feed_url: feedUrl,
    is_mature: isMature,
    last_checked_at: now,
    status: showLifecycle.status,
    feed_status: showLifecycle.feed_status,
    is_active: showLifecycle.is_active,
  };

  if (isMature && matureCategory) {
    showMetadata.mature_category = matureCategory;
  }

  if (!showId) {
    const preferredSlug = cleanText(options.show_slug, 80);
    const slug = preferredSlug || (await ensureUniqueShowSlug(parsed.title));
    const insertPayload = {
      ...showMetadata,
      slug,
      is_verified: false,
      is_featured: false,
      is_exclusive: false,
    };

    let insertResult = await supabaseAdmin
      .from("podcast_shows")
      .insert(insertPayload)
      .select("id")
      .single();

    if (
      insertResult.error &&
      isMissingMatureCategoryColumnError(insertResult.error.message)
    ) {
      insertResult = await supabaseAdmin
        .from("podcast_shows")
        .insert({
          ...stripMatureCategory(showMetadata),
          slug,
          is_verified: false,
          is_featured: false,
          is_exclusive: false,
        })
        .select("id")
        .single();
    }

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    showId = String(insertResult.data?.id || "");
    createdShow = true;
  } else {
    let updateShowError = (
      await supabaseAdmin.from("podcast_shows").update(showMetadata).eq("id", showId)
    ).error;

    if (
      updateShowError &&
      isMissingMatureCategoryColumnError(updateShowError.message)
    ) {
      updateShowError = (
        await supabaseAdmin
          .from("podcast_shows")
          .update(stripMatureCategory(showMetadata))
          .eq("id", showId)
      ).error;
    }

    if (updateShowError) {
      throw new Error(updateShowError.message);
    }
  }

  const existingEpisodes = await loadExistingEpisodes(showId);
  let episodesInserted = 0;
  let episodesUpdated = 0;
  let episodesSkipped = 0;
  const outcomeCounters = {
    episodes_auto_approved: 0,
    episodes_pending: 0,
    episodes_failed: 0,
  };

  for (const episode of parsed.episodes) {
    const episodeEvaluation = evaluatePodcastEpisodeAutoApproval(
      episode,
      parsed,
      showIsApprovedForEpisodes
    );

    const existing = findExistingEpisode(existingEpisodes, episode);
    const preserveEpisodeModeration = shouldPreserveEpisodeModeration(
      existing as
        | {
            status?: string | null;
            is_active?: boolean | null;
          }
        | undefined,
      autoApprove
    );

    let lifecycle = resolveEpisodeLifecycleFields(
      episodeEvaluation,
      autoApprove,
      preserveEpisodeModeration,
      existing as
        | {
            status?: string | null;
            playback_status?: string | null;
            is_active?: boolean | null;
          }
        | undefined
    );

    if (
      autoApprove &&
      !preserveEpisodeModeration &&
      !showIsApprovedForEpisodes
    ) {
      lifecycle = {
        status: "pending",
        is_active: false,
        playback_status:
          episodeEvaluation.playback_status === "failed" ? "failed" : "unchecked",
      };
    }

    const metadata: Record<string, unknown> = {
      title: episode.title,
      description: episode.description,
      artwork_url: episode.artwork_url,
      duration_seconds: episode.duration_seconds,
      published_at: episode.published_at,
      episode_number: episode.episode_number,
      season_number: episode.season_number,
      last_checked_at: now,
      status: lifecycle.status,
      playback_status: lifecycle.playback_status,
      is_active: lifecycle.is_active,
    };

    const episodeGuid = cleanText(episode.guid, 500);
    if (episodeGuid) {
      metadata.episode_guid = episodeGuid;
    }

    if (existing) {
      let updateEpisodeError = (
        await supabaseAdmin
          .from("podcast_episodes")
          .update(metadata)
          .eq("id", String(existing.id))
      ).error;

      if (
        updateEpisodeError &&
        isMissingEpisodeGuidColumnError(updateEpisodeError.message)
      ) {
        updateEpisodeError = (
          await supabaseAdmin
            .from("podcast_episodes")
            .update(stripEpisodeGuid(metadata))
            .eq("id", String(existing.id))
        ).error;
      }

      if (updateEpisodeError) {
        episodesSkipped += 1;
        continue;
      }

      episodesUpdated += 1;
      countEpisodeOutcome(lifecycle, outcomeCounters);
      continue;
    }

    let insertEpisodeError = (
      await supabaseAdmin.from("podcast_episodes").insert({
        show_id: showId,
        ...metadata,
        audio_url: episode.audio_url,
        is_verified: false,
      })
    ).error;

    if (
      insertEpisodeError &&
      isMissingEpisodeGuidColumnError(insertEpisodeError.message)
    ) {
      insertEpisodeError = (
        await supabaseAdmin.from("podcast_episodes").insert({
          show_id: showId,
          ...stripEpisodeGuid(metadata),
          audio_url: episode.audio_url,
          is_verified: false,
        })
      ).error;
    }

    if (insertEpisodeError) {
      episodesSkipped += 1;
      continue;
    }

    episodesInserted += 1;
    countEpisodeOutcome(lifecycle, outcomeCounters);
  }

  if (createdShow && episodesInserted === 0 && episodesUpdated === 0) {
    await supabaseAdmin.from("podcast_shows").delete().eq("id", showId);
    throw new Error("Feed produced no importable episodes.");
  }

  const showAutoApproved =
    autoApprove &&
    showLifecycle.status === "approved" &&
    showLifecycle.is_active &&
    showLifecycle.feed_status === "active";

  let message = createdShow
    ? "Podcast show ingested as pending. Episodes remain pending until approved."
    : "Existing podcast show refreshed. Moderation state preserved.";

  if (autoApprove && showAutoApproved) {
    message = `Podcast show auto-approved with ${outcomeCounters.episodes_auto_approved} playable episode(s).`;
  } else if (autoApprove) {
    message =
      "Auto-approve requested, but the show did not pass safety gates. Items remain pending or failed.";
  }

  return {
    success: true,
    show_id: showId,
    created_show: createdShow,
    feed_url: feedUrl,
    auto_approve_requested: autoApprove,
    show_auto_approved: showAutoApproved,
    episodes_found: parsed.episodes.length,
    episodes_inserted: episodesInserted,
    episodes_updated: episodesUpdated,
    episodes_skipped: episodesSkipped,
    episodes_auto_approved: outcomeCounters.episodes_auto_approved,
    episodes_pending: outcomeCounters.episodes_pending,
    episodes_failed: outcomeCounters.episodes_failed,
    message,
  };
}
