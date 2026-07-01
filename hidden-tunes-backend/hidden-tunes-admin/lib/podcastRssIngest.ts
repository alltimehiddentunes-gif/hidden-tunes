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

export async function fetchPodcastFeedXml(feedUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

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

async function loadExistingEpisodesByAudioUrl(showId: string) {
  const { data, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id, audio_url, status, playback_status, is_active, is_verified")
    .eq("show_id", showId);

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, Record<string, unknown>>();
  for (const row of data || []) {
    const audioUrl = cleanText((row as { audio_url?: string }).audio_url, 2000);
    if (audioUrl) map.set(audioUrl, row as Record<string, unknown>);
  }

  return map;
}

function parseAutoApprove(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
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
  const feedUrl = validatePodcastFeedUrl(feedUrlInput);
  if (!feedUrl) {
    throw new Error("A valid http(s) RSS feed URL is required.");
  }

  const xml = await fetchPodcastFeedXml(feedUrl);
  const parsed = parsePodcastFeedXml(xml);
  const autoApproval = evaluatePodcastFeedAutoApproval(parsed, feedUrl);
  const now = new Date().toISOString();

  const { data: existingShow, error: existingShowError } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, slug, status, feed_status, is_active")
    .eq("feed_url", feedUrl)
    .maybeSingle();

  if (existingShowError) {
    throw new Error(existingShowError.message);
  }

  let showId = String(existingShow?.id || "");
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

  const showMetadata = {
    title: parsed.title,
    description: parsed.description,
    artwork_url: parsed.artwork_url,
    host_name: parsed.host_name,
    publisher: parsed.publisher,
    language: parsed.language,
    primary_category: parsed.primary_category,
    categories: parsed.categories,
    feed_url: feedUrl,
    last_checked_at: now,
    status: showLifecycle.status,
    feed_status: showLifecycle.feed_status,
    is_active: showLifecycle.is_active,
  };

  if (!showId) {
    const slug = await ensureUniqueShowSlug(parsed.title);
    const { data: insertedShow, error: insertShowError } = await supabaseAdmin
      .from("podcast_shows")
      .insert({
        ...showMetadata,
        slug,
        is_verified: false,
        is_featured: false,
        is_exclusive: false,
        is_mature: false,
      })
      .select("id")
      .single();

    if (insertShowError) {
      throw new Error(insertShowError.message);
    }

    showId = String(insertedShow.id);
    createdShow = true;
  } else {
    const { error: updateShowError } = await supabaseAdmin
      .from("podcast_shows")
      .update(showMetadata)
      .eq("id", showId);

    if (updateShowError) {
      throw new Error(updateShowError.message);
    }
  }

  const existingEpisodes = await loadExistingEpisodesByAudioUrl(showId);
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

    const existing = existingEpisodes.get(episode.audio_url);
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

    const metadata = {
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

    if (existing) {
      const { error: updateEpisodeError } = await supabaseAdmin
        .from("podcast_episodes")
        .update(metadata)
        .eq("id", String(existing.id));

      if (updateEpisodeError) {
        episodesSkipped += 1;
        continue;
      }

      episodesUpdated += 1;
      countEpisodeOutcome(lifecycle, outcomeCounters);
      continue;
    }

    const { error: insertEpisodeError } = await supabaseAdmin
      .from("podcast_episodes")
      .insert({
        show_id: showId,
        ...metadata,
        audio_url: episode.audio_url,
        is_verified: false,
      });

    if (insertEpisodeError) {
      episodesSkipped += 1;
      continue;
    }

    episodesInserted += 1;
    countEpisodeOutcome(lifecycle, outcomeCounters);
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
