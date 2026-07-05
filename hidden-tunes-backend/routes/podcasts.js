import express from "express";
import { XMLParser } from "fast-xml-parser";
import { supabase } from "../services/supabase.js";
import {
  createRequestTimer,
  logApiError,
  logApiRequest,
  logApiSuccess,
  logSupabaseError,
} from "../services/apiDiagnostics.js";
import { escapeIlikePattern } from "../services/queryGuards.js";

const router = express.Router();

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 40;
const MAX_PAGE = 5000;

const CATEGORY_SELECT = `
  id,
  slug,
  name,
  description,
  sort_order
`;

const SHOW_SELECT = `
  id,
  title,
  host_name,
  artwork_url,
  primary_category,
  mature_category,
  categories,
  language,
  is_mature
`;

const EPISODE_SELECT = `
  id,
  show_id,
  title,
  description,
  artwork_url,
  duration_seconds,
  published_at,
  podcast_shows!inner(${SHOW_SELECT})
`;

const EPISODE_PLAY_SELECT = `
  id,
  show_id,
  title,
  artwork_url,
  duration_seconds,
  audio_url,
  podcast_shows!inner(
    title,
    artwork_url,
    is_mature
  )
`;

const CATEGORY_GRADIENTS = [
  ["#1A0830", "#12071F"],
  ["#10233A", "#07111F"],
  ["#2A1234", "#120612"],
  ["#123224", "#07140E"],
];

const MATURE_CATEGORIES = [
  {
    id: "relationships",
    slug: "relationships",
    title: "Relationships",
    subtitle: "Adult relationship conversations",
    icon: "heart-outline",
  },
  {
    id: "dating",
    slug: "dating",
    title: "Dating",
    subtitle: "Modern dating, boundaries, and stories",
    icon: "chatbubbles-outline",
  },
  {
    id: "intimacy-education",
    slug: "intimacy-education",
    title: "Intimacy Education",
    subtitle: "Consent-forward adult education",
    icon: "school-outline",
  },
  {
    id: "adult-lifestyle",
    slug: "adult-lifestyle",
    title: "Adult Lifestyle",
    subtitle: "Culture and lifestyle for adults",
    icon: "sparkles-outline",
  },
  {
    id: "confessions-stories",
    slug: "confessions-stories",
    title: "Confessions / Stories",
    subtitle: "Personal stories and candid conversations",
    icon: "book-outline",
  },
  {
    id: "wellness-18",
    slug: "wellness-18",
    title: "Wellness 18+",
    subtitle: "Adult wellness and health conversations",
    icon: "pulse-outline",
  },
  {
    id: "mature-comedy",
    slug: "mature-comedy",
    title: "Mature Comedy",
    subtitle: "Explicit comedy for adult listeners",
    icon: "happy-outline",
  },
  {
    id: "mature-talk-shows",
    slug: "mature-talk-shows",
    title: "Mature Talk Shows",
    subtitle: "Unfiltered interviews and talk shows",
    icon: "mic-outline",
  },
];

const PODCAST_SEED_FEEDS = [
  {
    title: "Call Her Daddy",
    aliases: ["Call Her Daddy - Alex Cooper", "Call Her Daddy with Alex Cooper"],
    feedUrl: "https://feeds.simplecast.com/mKn_QmLS",
    category: "relationships-dating",
    matureCategory: "dating",
    isMature: true,
  },
  {
    title: "Girls Gotta Eat",
    feedUrl: "https://feeds.megaphone.fm/DEARMEDIALLC6497520465",
    category: "relationships-dating",
    matureCategory: "dating",
    isMature: true,
  },
  {
    title: "Why Won't You Date Me?",
    aliases: ["Why Won't You Date Me? with Nicole Byer"],
    feedUrl: "https://rss.art19.com/why-wont-you-date-me",
    category: "relationships-dating",
    matureCategory: "mature-comedy",
    isMature: true,
  },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

function normalizePage(query = {}) {
  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const page = Math.min(
    Math.max(Number.parseInt(String(query.page || 1), 10) || 1, 1),
    MAX_PAGE
  );

  return {
    limit,
    page,
    offset: (page - 1) * limit,
  };
}

function includeMature(query = {}) {
  return String(query.include_mature || query.includeMature || "").toLowerCase() === "true";
}

function matureGateEnabled(query = {}) {
  const matureEnabled =
    String(query.mature_enabled || query.matureEnabled || "").toLowerCase() === "true";
  const ageConfirmed =
    String(query.age_confirmed || query.ageConfirmed || "").toLowerCase() === "true";
  return matureEnabled && ageConfirmed;
}

function slugifyCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value, maxLength = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function stripHtml(value) {
  return cleanText(value, 4000)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHttpUrl(value) {
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

function normalizeAudioUrl(value) {
  const url = normalizeHttpUrl(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const text = cleanText(value, 40);
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);

  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function parsePublishedAt(value) {
  const text = cleanText(value, 120);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function extractRssImage(channel) {
  const image = channel.image;
  if (typeof image === "string") return normalizeHttpUrl(image);
  if (image && typeof image === "object") {
    return normalizeHttpUrl(image.url || image["@_href"]);
  }

  const itunesImage = channel["itunes:image"];
  if (itunesImage && typeof itunesImage === "object") {
    return normalizeHttpUrl(itunesImage["@_href"]);
  }

  return normalizeHttpUrl(itunesImage);
}

function extractEpisodeImage(item) {
  const itunesImage = item["itunes:image"];
  if (itunesImage && typeof itunesImage === "object") {
    return normalizeHttpUrl(itunesImage["@_href"]);
  }
  return normalizeHttpUrl(itunesImage);
}

function extractEpisodeAudioUrl(item) {
  for (const enclosure of asArray(item.enclosure)) {
    if (!enclosure || typeof enclosure !== "object") continue;
    const type = cleanText(enclosure["@_type"], 80).toLowerCase();
    const url = normalizeAudioUrl(enclosure["@_url"]);
    if (url && (!type || type.startsWith("audio/"))) return url;
  }

  const mediaGroup = item["media:group"];
  const mediaContents = asArray(item["media:content"]).concat(
    mediaGroup && typeof mediaGroup === "object" ? asArray(mediaGroup["media:content"]) : []
  );

  for (const media of mediaContents) {
    if (!media || typeof media !== "object") continue;
    const type = cleanText(media["@_type"], 80).toLowerCase();
    const url = normalizeAudioUrl(media["@_url"]);
    if (url && (!type || type.startsWith("audio/"))) return url;
  }

  return null;
}

function parsePodcastXml(xml) {
  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel;
  const feed = parsed?.feed;

  if (channel && typeof channel === "object") {
    const title = cleanText(channel.title, 300);
    const episodes = [];

    for (const item of asArray(channel.item)) {
      if (!item || typeof item !== "object") continue;
      const episodeTitle = cleanText(item.title, 300);
      const audioUrl = extractEpisodeAudioUrl(item);
      if (!episodeTitle || !audioUrl) continue;

      episodes.push({
        title: episodeTitle,
        description:
          stripHtml(item["content:encoded"]) ||
          stripHtml(item.description) ||
          stripHtml(item["itunes:summary"]),
        artwork_url: extractEpisodeImage(item),
        audio_url: audioUrl,
        duration_seconds: parseDurationSeconds(item["itunes:duration"]),
        published_at: parsePublishedAt(item.pubDate || item.published),
        episode_number: Number.isFinite(Number(item["itunes:episode"]))
          ? Number(item["itunes:episode"])
          : null,
        season_number: Number.isFinite(Number(item["itunes:season"]))
          ? Number(item["itunes:season"])
          : null,
      });
    }

    return {
      title,
      description:
        stripHtml(channel.description) || stripHtml(channel["itunes:summary"]),
      artwork_url: extractRssImage(channel),
      host_name:
        cleanText(channel["itunes:author"], 160) ||
        cleanText(channel["dc:creator"], 160),
      publisher: cleanText(channel["itunes:author"], 160),
      language: cleanText(channel.language, 40),
      episodes,
    };
  }

  if (feed && typeof feed === "object") {
    const title = cleanText(feed.title, 300);
    const episodes = [];

    for (const entry of asArray(feed.entry)) {
      if (!entry || typeof entry !== "object") continue;
      const episodeTitle = cleanText(entry.title, 300);
      let audioUrl = null;
      for (const link of asArray(entry.link)) {
        if (!link || typeof link !== "object") continue;
        const rel = cleanText(link["@_rel"], 80).toLowerCase();
        const type = cleanText(link["@_type"], 80).toLowerCase();
        if (rel === "enclosure" || type.startsWith("audio/")) {
          audioUrl = normalizeAudioUrl(link["@_href"]);
          if (audioUrl) break;
        }
      }
      if (!episodeTitle || !audioUrl) continue;

      episodes.push({
        title: episodeTitle,
        description: stripHtml(entry.summary) || stripHtml(entry.content),
        artwork_url: null,
        audio_url: audioUrl,
        duration_seconds: null,
        published_at: parsePublishedAt(entry.published || entry.updated),
        episode_number: null,
        season_number: null,
      });
    }

    return {
      title,
      description: stripHtml(feed.subtitle) || stripHtml(feed.summary),
      artwork_url: null,
      host_name: cleanText(feed.author?.name, 160),
      publisher: cleanText(feed.author?.name, 160),
      language: "",
      episodes,
    };
  }

  throw new Error("Unsupported podcast feed XML");
}

function logPodcastRss(details) {
  console.log("[HT_PODCAST_RSS]", {
    at: Date.now(),
    ...details,
  });
}

function slugifyValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findSeedFeed({ id = "", title = "" } = {}) {
  const cleanId = slugifyValue(id).replace(/^mature-/, "");
  const cleanTitle = slugifyValue(title);

  return (
    PODCAST_SEED_FEEDS.find((seed) => {
      const titles = [seed.title, ...(seed.aliases || [])];
      return titles.some((candidate) => {
        const seedTitle = slugifyValue(candidate);
        return (
          seedTitle === cleanTitle ||
          seedTitle === cleanId ||
          cleanTitle.includes(seedTitle) ||
          seedTitle.includes(cleanTitle)
        );
      });
    }) || null
  );
}

async function fetchFeedXmlWithDiagnostics(seed) {
  const startedAt = Date.now();
  console.log("[podcasts] rss feed url", seed.feedUrl);
  logPodcastRss({
    event: "rss_fetch_start",
    title: seed.title,
    rssUrl: seed.feedUrl,
  });

  const response = await fetch(seed.feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    redirect: "follow",
  });

  logPodcastRss({
    event: "rss_fetch_complete",
    title: seed.title,
    rssUrl: seed.feedUrl,
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
  });

  if (!response.ok) {
    throw new Error(`Podcast RSS request failed with status ${response.status}`);
  }

  const xml = await response.text();
  if (!xml.trim()) {
    throw new Error("Podcast RSS response was empty");
  }

  return { xml, httpStatus: response.status };
}

async function ensureUniquePodcastSlug(baseTitle) {
  const baseSlug = slugifyValue(baseTitle) || "podcast";
  let candidate = baseSlug;
  let suffix = 2;

  while (suffix < 100) {
    const { data, error } = await supabase
      .from("podcast_shows")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return `${baseSlug}-${Date.now()}`;
}

async function loadPodcastShowForSeed(seed) {
  const { data: byFeed, error: feedError } = await supabase
    .from("podcast_shows")
    .select("id")
    .eq("feed_url", seed.feedUrl)
    .maybeSingle();

  if (feedError) throw feedError;
  if (byFeed?.id) return String(byFeed.id);

  const titles = [seed.title, ...(seed.aliases || [])];
  for (const title of titles) {
    const { data, error } = await supabase
      .from("podcast_shows")
      .select("id")
      .ilike("title", title)
      .limit(1);

    if (error) throw error;
    if (data?.[0]?.id) return String(data[0].id);
  }

  return "";
}

async function hasCachedPodcastEpisodes(showId, allowMature) {
  if (!showId) return false;

  let request = supabase
    .from("podcast_episodes")
    .select("id, podcast_shows!inner(is_mature)", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  if (!allowMature) {
    request = request.eq("podcast_shows.is_mature", false);
  }

  const { count, error } = await request;
  if (error) throw error;
  return Number(count || 0) > 0;
}

async function importSeedPodcastFeed(seed) {
  const { xml, httpStatus } = await fetchFeedXmlWithDiagnostics(seed);
  const parsed = parsePodcastXml(xml);
  const parsedEpisodes = parsed.episodes || [];

  logPodcastRss({
    event: "rss_parse_complete",
    title: seed.title,
    rssUrl: seed.feedUrl,
    httpStatus,
    parsedEpisodeCount: parsedEpisodes.length,
  });

  if (parsedEpisodes.length === 0) {
    throw new Error("Podcast RSS parser returned zero playable episodes");
  }

  let showId = await loadPodcastShowForSeed(seed);
  const now = new Date().toISOString();
  const showMetadata = {
    title: parsed.title || seed.title,
    slug: undefined,
    description: parsed.description || "",
    artwork_url: parsed.artwork_url || null,
    host_name: parsed.host_name || parsed.publisher || "",
    primary_category: seed.category,
    categories: [seed.category],
    language: parsed.language || "",
    publisher: parsed.publisher || parsed.host_name || "",
    feed_url: seed.feedUrl,
    status: "approved",
    feed_status: "active",
    is_active: true,
    is_verified: true,
    is_mature: seed.isMature === true,
    mature_category: seed.isMature === true ? seed.matureCategory || null : null,
    last_checked_at: now,
  };

  if (!showId) {
    const slug = await ensureUniquePodcastSlug(parsed.title || seed.title);
    const { data, error } = await supabase
      .from("podcast_shows")
      .insert({
        ...showMetadata,
        slug,
        is_featured: false,
        is_exclusive: false,
      })
      .select("id")
      .single();

    if (error) throw error;
    showId = String(data.id);
  } else {
    const { error } = await supabase
      .from("podcast_shows")
      .update(showMetadata)
      .eq("id", showId);

    if (error) throw error;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("podcast_episodes")
    .select("id, audio_url")
    .eq("show_id", showId);

  if (existingError) throw existingError;

  const existingByAudioUrl = new Map(
    (existingRows || [])
      .map((row) => [String(row.audio_url || ""), String(row.id || "")])
      .filter(([audioUrl, id]) => audioUrl && id)
  );

  let created = 0;
  let updated = 0;
  for (const episode of parsedEpisodes) {
    const metadata = {
      title: episode.title,
      description: episode.description || "",
      artwork_url: episode.artwork_url || parsed.artwork_url || null,
      duration_seconds: episode.duration_seconds,
      published_at: episode.published_at,
      episode_number: episode.episode_number,
      season_number: episode.season_number,
      status: "approved",
      playback_status: "playable",
      is_active: true,
      is_verified: true,
      last_checked_at: now,
    };

    const existingId = existingByAudioUrl.get(episode.audio_url);
    if (existingId) {
      const { error } = await supabase
        .from("podcast_episodes")
        .update(metadata)
        .eq("id", existingId);
      if (!error) updated += 1;
      continue;
    }

    const { error } = await supabase.from("podcast_episodes").insert({
      show_id: showId,
      ...metadata,
      audio_url: episode.audio_url,
    });

    if (!error) created += 1;
  }

  logPodcastRss({
    event: "rss_import_complete",
    title: seed.title,
    rssUrl: seed.feedUrl,
    httpStatus,
    parsedEpisodeCount: parsedEpisodes.length,
    episodesCreated: created,
    episodesUpdated: updated,
    showId,
  });

  return { showId, parsedEpisodeCount: parsedEpisodes.length, httpStatus };
}

async function importPodcastFeedForShow(showId, allowMature) {
  if (!showId) return null;

  let request = supabase
    .from("podcast_shows")
    .select("id, title, feed_url, primary_category, is_mature")
    .eq("id", showId)
    .eq("status", "approved")
    .eq("is_active", true)
    .limit(1);

  if (!allowMature) {
    request = request.eq("is_mature", false);
  }

  const { data, error } = await request;
  if (error) throw error;

  const show = data?.[0];
  const feedUrl = normalizeHttpUrl(show?.feed_url);
  if (!show?.id || !feedUrl) return null;

  return importSeedPodcastFeed({
    title: show.title || "Hidden Tunes Podcast",
    feedUrl,
    category: show.primary_category || "podcasts",
    isMature: show.is_mature === true,
  });
}

async function resolvePodcastShowId({ id = "", title = "", includeMatureShows = false } = {}) {
  const cleanId = String(id || "").trim();

  if (cleanId && /^[0-9a-f-]{20,}$/i.test(cleanId)) {
    return cleanId;
  }

  const seed = findSeedFeed({ id: cleanId, title });
  if (seed) {
    const existingShowId = await loadPodcastShowForSeed(seed);
    if (await hasCachedPodcastEpisodes(existingShowId, includeMatureShows)) {
      return existingShowId;
    }

    const imported = await importSeedPodcastFeed(seed);
    return imported.showId;
  }

  const titleSearch = cleanText(title || cleanId, 300);
  if (!titleSearch) return cleanId;

  let request = supabase
    .from("podcast_shows")
    .select("id")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .ilike("title", `%${escapeIlikePattern(titleSearch)}%`);

  if (!includeMatureShows) {
    request = request.eq("is_mature", false);
  }

  const { data, error } = await request.limit(1);
  if (error) throw error;
  return data?.[0]?.id ? String(data[0].id) : cleanId;
}

function normalizeCategories(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function getShow(row) {
  const embedded = row?.podcast_shows;
  if (Array.isArray(embedded)) return embedded[0] || {};
  return embedded || {};
}

function showMatchesCategory(show, category) {
  const categorySlug = slugifyCategory(category.slug);
  const categoryNameSlug = slugifyCategory(category.name);
  const primarySlug = slugifyCategory(show.primary_category);
  const categorySlugs = normalizeCategories(show.categories).map(slugifyCategory);

  return (
    primarySlug === categorySlug ||
    primarySlug === categoryNameSlug ||
    categorySlugs.includes(categorySlug) ||
    categorySlugs.includes(categoryNameSlug)
  );
}

function normalizeCategory(row, itemCount, index) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.name || "Podcasts",
    subtitle: row.description || "",
    icon: "mic-outline",
    artwork_url: null,
    item_count: Number(itemCount || 0),
    gradient: CATEGORY_GRADIENTS[index % CATEGORY_GRADIENTS.length],
    children: [],
  };
}

function normalizeMatureCategory(category, itemCount, index) {
  return {
    id: category.id,
    slug: category.slug,
    title: category.title,
    subtitle: category.subtitle,
    icon: category.icon,
    artwork_url: null,
    item_count: Number(itemCount || 0),
    gradient: CATEGORY_GRADIENTS[index % CATEGORY_GRADIENTS.length],
    children: [],
  };
}

function normalizeEpisodeMetadata(row, categorySlug = "") {
  const show = getShow(row);
  return {
    id: row.id,
    title: row.title || "Untitled Episode",
    podcast_title: show.title || "Hidden Tunes Podcast",
    host: show.host_name || "",
    description: row.description || "",
    duration_seconds: Number(row.duration_seconds || 0),
    artwork_url: row.artwork_url || show.artwork_url || null,
    category_slug:
      categorySlug || slugifyCategory(show.mature_category || show.primary_category),
    language: show.language || "",
    published_at: row.published_at || null,
    is_mature: show.is_mature === true,
  };
}

function normalizeEpisodePlay(row) {
  const show = getShow(row);
  return {
    id: row.id,
    title: row.title || "Untitled Episode",
    podcast_title: show.title || "Hidden Tunes Podcast",
    artwork_url: row.artwork_url || show.artwork_url || null,
    duration_seconds: Number(row.duration_seconds || 0),
    audio_url: row.audio_url || "",
  };
}

function applyPublicEpisodeFilters(request, allowMature) {
  let next = request
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("podcast_shows.status", "approved")
    .eq("podcast_shows.is_active", true)
    .eq("podcast_shows.feed_status", "active");

  if (!allowMature) {
    next = next.eq("podcast_shows.is_mature", false);
  }

  return next;
}

function applyMatureEpisodeFilters(request) {
  return request
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("podcast_shows.status", "approved")
    .eq("podcast_shows.is_active", true)
    .eq("podcast_shows.feed_status", "active")
    .eq("podcast_shows.is_mature", true);
}

async function countMatureEpisodesForCategory(slug) {
  let request = supabase
    .from("podcast_episodes")
    .select("id, podcast_shows!inner(mature_category, is_mature)", {
      count: "exact",
      head: true,
    })
    .eq("podcast_shows.mature_category", slug);

  request = applyMatureEpisodeFilters(request);
  const { count, error } = await request;
  return { count: count || 0, error };
}

async function fetchActiveCategories() {
  const { data, error } = await supabase
    .from("podcast_categories")
    .select(CATEGORY_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return { data: data || [], error };
}

async function fetchCategoryShowIds(category, allowMature) {
  let request = supabase
    .from("podcast_shows")
    .select("id, primary_category, categories")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active");

  if (!allowMature) {
    request = request.eq("is_mature", false);
  }

  const { data, error } = await request;
  if (error) return { ids: [], error };

  const ids = (data || [])
    .filter((show) => showMatchesCategory(show, category))
    .map((show) => show.id)
    .filter(Boolean);

  return { ids, error: null };
}

async function countPlayableEpisodes(showIds, allowMature) {
  if (showIds.length === 0) return { count: 0, error: null };

  let request = supabase
    .from("podcast_episodes")
    .select("id, podcast_shows!inner(is_mature)", { count: "exact", head: true })
    .in("show_id", showIds)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  if (!allowMature) {
    request = request.eq("podcast_shows.is_mature", false);
  }

  const { count, error } = await request;
  return { count: count || 0, error };
}

router.get("/tree", async (req, res) => {
  const timer = createRequestTimer();
  const allowMature = includeMature(req.query);

  logApiRequest("GET /api/podcasts/tree", { includeMature: allowMature });

  try {
    const { data: categories, error } = await fetchActiveCategories();
    if (error) {
      logSupabaseError("GET /api/podcasts/tree", error);
      return res.status(500).json({ error: "Failed to fetch podcast tree" });
    }

    const visibleCategories = [];

    for (const category of categories) {
      const { ids, error: showError } = await fetchCategoryShowIds(category, allowMature);
      if (showError) {
        logSupabaseError("GET /api/podcasts/tree", showError, { category: category.slug });
        return res.status(500).json({ error: "Failed to fetch podcast tree" });
      }

      const { count, error: countError } = await countPlayableEpisodes(ids, allowMature);
      if (countError) {
        logSupabaseError("GET /api/podcasts/tree", countError, { category: category.slug });
        return res.status(500).json({ error: "Failed to fetch podcast tree" });
      }

      if (count > 0) {
        visibleCategories.push(normalizeCategory(category, count, visibleCategories.length));
      }
    }

    logApiSuccess("GET /api/podcasts/tree", {
      durationMs: timer.durationMs(),
      resultCount: visibleCategories.length,
    });

    return res.json({ categories: visibleCategories });
  } catch (error) {
    logApiError("GET /api/podcasts/tree", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/show/:id/episodes", async (req, res) => {
  const timer = createRequestTimer();
  const id = String(req.params.id || "").trim();
  const title = String(req.query.title || "").trim();
  const pagination = normalizePage(req.query);
  const allowMature = includeMature(req.query);

  logApiRequest("GET /api/podcasts/show/:id/episodes", {
    id,
    title,
    page: pagination.page,
    limit: pagination.limit,
    includeMature: allowMature,
  });
  console.log("[podcasts] detail fetch", { id, slug: id });

  try {
    const showId = await resolvePodcastShowId({
      id,
      title,
      includeMatureShows: allowMature,
    });

    if (!showId) {
      console.log("[podcasts] episodes returned", 0);
      logPodcastRss({
        event: "episode_endpoint_return",
        showId: id,
        title,
        returnedEpisodeCount: 0,
      });
      return res.json({
        items: [],
        page: pagination.page,
        limit: pagination.limit,
        hasMore: false,
      });
    }

    const fetchRows = async () => {
      const rangeEnd = pagination.offset + pagination.limit;
      let request = supabase
        .from("podcast_episodes")
        .select(EPISODE_SELECT)
        .eq("show_id", showId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(pagination.offset, rangeEnd);

      request = applyPublicEpisodeFilters(request, allowMature);
      return request;
    };

    let { data, error } = await fetchRows();
    if (error) {
      logSupabaseError("GET /api/podcasts/show/:id/episodes", error, { id, showId });
      return res.status(500).json({ error: "Failed to fetch podcast episodes" });
    }

    if ((data || []).length === 0 && pagination.page === 1) {
      await importPodcastFeedForShow(showId, allowMature);
      const refreshed = await fetchRows();
      data = refreshed.data;
      error = refreshed.error;

      if (error) {
        logSupabaseError("GET /api/podcasts/show/:id/episodes", error, { id, showId });
        return res.status(500).json({ error: "Failed to fetch podcast episodes" });
      }
    }

    const rows = data || [];
    const pageRows = rows.slice(0, pagination.limit);
    console.log("[podcasts] episodes returned", pageRows.length);

    logPodcastRss({
      event: "episode_endpoint_return",
      showId,
      requestedId: id,
      title,
      returnedEpisodeCount: pageRows.length,
    });

    logApiSuccess("GET /api/podcasts/show/:id/episodes", {
      durationMs: timer.durationMs(),
      resultCount: pageRows.length,
      hasMore: rows.length > pagination.limit,
    });

    return res.json({
      items: pageRows.map((row) => normalizeEpisodeMetadata(row)),
      page: pagination.page,
      limit: pagination.limit,
      hasMore: rows.length > pagination.limit,
    });
  } catch (error) {
    logApiError("GET /api/podcasts/show/:id/episodes", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      id,
      title,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/category/:slug", async (req, res) => {
  const timer = createRequestTimer();
  const slug = String(req.params.slug || "").trim();
  const pagination = normalizePage(req.query);
  const allowMature = includeMature(req.query);

  logApiRequest("GET /api/podcasts/category/:slug", {
    slug,
    page: pagination.page,
    limit: pagination.limit,
    includeMature: allowMature,
  });

  try {
    const { data: categories, error: categoryError } = await fetchActiveCategories();
    if (categoryError) {
      logSupabaseError("GET /api/podcasts/category/:slug", categoryError, { slug });
      return res.status(500).json({ error: "Failed to fetch podcast category" });
    }

    const category = (categories || []).find((row) => row.slug === slug);
    if (!category) {
      return res.json({
        items: [],
        page: pagination.page,
        limit: pagination.limit,
        hasMore: false,
      });
    }

    const { ids: showIds, error: showError } = await fetchCategoryShowIds(category, allowMature);
    if (showError) {
      logSupabaseError("GET /api/podcasts/category/:slug", showError, { slug });
      return res.status(500).json({ error: "Failed to fetch podcast episodes" });
    }

    if (showIds.length === 0) {
      return res.json({
        items: [],
        page: pagination.page,
        limit: pagination.limit,
        hasMore: false,
      });
    }

    const rangeEnd = pagination.offset + pagination.limit;
    let request = supabase
      .from("podcast_episodes")
      .select(EPISODE_SELECT)
      .in("show_id", showIds)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(pagination.offset, rangeEnd);

    request = applyPublicEpisodeFilters(request, allowMature);

    const { data, error } = await request;
    if (error) {
      logSupabaseError("GET /api/podcasts/category/:slug", error, { slug });
      return res.status(500).json({ error: "Failed to fetch podcast episodes" });
    }

    const rows = data || [];
    const pageRows = rows.slice(0, pagination.limit);

    logApiSuccess("GET /api/podcasts/category/:slug", {
      durationMs: timer.durationMs(),
      resultCount: pageRows.length,
      hasMore: rows.length > pagination.limit,
    });

    return res.json({
      items: pageRows.map((row) => normalizeEpisodeMetadata(row, slug)),
      page: pagination.page,
      limit: pagination.limit,
      hasMore: rows.length > pagination.limit,
    });
  } catch (error) {
    logApiError("GET /api/podcasts/category/:slug", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      slug,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/search", async (req, res) => {
  const timer = createRequestTimer();
  const q = String(req.query.q || "").trim();
  const search = escapeIlikePattern(q);
  const pagination = normalizePage(req.query);
  const allowMature = includeMature(req.query);

  logApiRequest("GET /api/podcasts/search", {
    q,
    page: pagination.page,
    limit: pagination.limit,
    includeMature: allowMature,
  });

  try {
    if (!search) {
      return res.json({
        items: [],
        page: pagination.page,
        limit: pagination.limit,
        hasMore: false,
      });
    }

    const rangeEnd = pagination.offset + pagination.limit;
    let request = supabase
      .from("podcast_episodes")
      .select(EPISODE_SELECT)
      .or(`title.ilike.%${search}%,description.ilike.%${search}%`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(pagination.offset, rangeEnd);

    request = applyPublicEpisodeFilters(request, allowMature);

    const { data, error } = await request;
    if (error) {
      logSupabaseError("GET /api/podcasts/search", error, { q });
      return res.status(500).json({ error: "Failed to search podcast episodes" });
    }

    const rows = data || [];
    const pageRows = rows.slice(0, pagination.limit);

    logApiSuccess("GET /api/podcasts/search", {
      durationMs: timer.durationMs(),
      resultCount: pageRows.length,
      hasMore: rows.length > pagination.limit,
    });

    return res.json({
      items: pageRows.map((row) => normalizeEpisodeMetadata(row)),
      page: pagination.page,
      limit: pagination.limit,
      hasMore: rows.length > pagination.limit,
    });
  } catch (error) {
    logApiError("GET /api/podcasts/search", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      q,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/mature/categories", async (req, res) => {
  const timer = createRequestTimer();
  const gateOk = matureGateEnabled(req.query);

  logApiRequest("GET /api/podcasts/mature/categories", { gateOk });

  try {
    if (!gateOk) {
      return res.status(403).json({ error: "Mature podcasts require age confirmation" });
    }

    const categories = [];
    for (const category of MATURE_CATEGORIES) {
      const { count, error } = await countMatureEpisodesForCategory(category.slug);
      if (error) {
        logSupabaseError("GET /api/podcasts/mature/categories", error, {
          category: category.slug,
        });
        return res.status(500).json({ error: "Failed to fetch mature categories" });
      }
      categories.push(normalizeMatureCategory(category, count, categories.length));
    }

    logApiSuccess("GET /api/podcasts/mature/categories", {
      durationMs: timer.durationMs(),
      resultCount: categories.length,
    });

    return res.json({ categories });
  } catch (error) {
    logApiError("GET /api/podcasts/mature/categories", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/mature/episodes", async (req, res) => {
  const timer = createRequestTimer();
  const gateOk = matureGateEnabled(req.query);
  const category = String(req.query.category || "").trim();
  const pagination = normalizePage(req.query);

  logApiRequest("GET /api/podcasts/mature/episodes", {
    category,
    gateOk,
    page: pagination.page,
    limit: pagination.limit,
  });

  try {
    if (!gateOk) {
      return res.status(403).json({ error: "Mature podcasts require age confirmation" });
    }

    const rangeEnd = pagination.offset + pagination.limit;
    let request = supabase
      .from("podcast_episodes")
      .select(EPISODE_SELECT)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(pagination.offset, rangeEnd);

    request = applyMatureEpisodeFilters(request);

    if (category) {
      request = request.eq("podcast_shows.mature_category", category);
    }

    const { data, error } = await request;
    if (error) {
      logSupabaseError("GET /api/podcasts/mature/episodes", error, { category });
      return res.status(500).json({ error: "Failed to fetch mature episodes" });
    }

    const rows = data || [];
    const pageRows = rows.slice(0, pagination.limit);

    logApiSuccess("GET /api/podcasts/mature/episodes", {
      durationMs: timer.durationMs(),
      resultCount: pageRows.length,
      hasMore: rows.length > pagination.limit,
    });

    return res.json({
      items: pageRows.map((row) => normalizeEpisodeMetadata(row, category)),
      page: pagination.page,
      limit: pagination.limit,
      hasMore: rows.length > pagination.limit,
    });
  } catch (error) {
    logApiError("GET /api/podcasts/mature/episodes", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      category,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/mature/search", async (req, res) => {
  const timer = createRequestTimer();
  const gateOk = matureGateEnabled(req.query);
  const q = String(req.query.q || "").trim();
  const search = escapeIlikePattern(q);
  const pagination = normalizePage(req.query);

  logApiRequest("GET /api/podcasts/mature/search", {
    q,
    gateOk,
    page: pagination.page,
    limit: pagination.limit,
  });

  try {
    if (!gateOk) {
      return res.status(403).json({ error: "Mature podcasts require age confirmation" });
    }

    if (!search) {
      return res.json({
        items: [],
        page: pagination.page,
        limit: pagination.limit,
        hasMore: false,
      });
    }

    const rangeEnd = pagination.offset + pagination.limit;
    let request = supabase
      .from("podcast_episodes")
      .select(EPISODE_SELECT)
      .or(`title.ilike.%${search}%,description.ilike.%${search}%`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(pagination.offset, rangeEnd);

    request = applyMatureEpisodeFilters(request);

    const { data, error } = await request;
    if (error) {
      logSupabaseError("GET /api/podcasts/mature/search", error, { q });
      return res.status(500).json({ error: "Failed to search mature episodes" });
    }

    const rows = data || [];
    const pageRows = rows.slice(0, pagination.limit);

    logApiSuccess("GET /api/podcasts/mature/search", {
      durationMs: timer.durationMs(),
      resultCount: pageRows.length,
      hasMore: rows.length > pagination.limit,
    });

    return res.json({
      items: pageRows.map((row) => normalizeEpisodeMetadata(row)),
      page: pagination.page,
      limit: pagination.limit,
      hasMore: rows.length > pagination.limit,
    });
  } catch (error) {
    logApiError("GET /api/podcasts/mature/search", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      q,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/mature/episodes/:id/play", async (req, res) => {
  const timer = createRequestTimer();
  const gateOk = matureGateEnabled(req.query);
  const id = String(req.params.id || "").trim();

  logApiRequest("GET /api/podcasts/mature/episodes/:id/play", { id, gateOk });

  try {
    if (!gateOk) {
      return res.status(403).json({ error: "Mature podcasts require age confirmation" });
    }

    let request = supabase
      .from("podcast_episodes")
      .select(EPISODE_PLAY_SELECT)
      .eq("id", id)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .eq("podcast_shows.status", "approved")
      .eq("podcast_shows.is_active", true)
      .eq("podcast_shows.feed_status", "active")
      .eq("podcast_shows.is_mature", true);

    const { data, error } = await request.maybeSingle();
    if (error) {
      logSupabaseError("GET /api/podcasts/mature/episodes/:id/play", error, { id });
      return res.status(500).json({ error: "Failed to fetch mature podcast audio" });
    }

    if (!data?.audio_url) {
      return res.status(404).json({ error: "Podcast audio unavailable" });
    }

    logApiSuccess("GET /api/podcasts/mature/episodes/:id/play", {
      durationMs: timer.durationMs(),
      resultCount: 1,
    });

    return res.json(normalizeEpisodePlay(data));
  } catch (error) {
    logApiError("GET /api/podcasts/mature/episodes/:id/play", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      id,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/:id/play", async (req, res) => {
  const timer = createRequestTimer();
  const id = String(req.params.id || "").trim();
  const allowMature = includeMature(req.query);

  logApiRequest("GET /api/podcasts/:id/play", { id, includeMature: allowMature });

  try {
    let request = supabase
      .from("podcast_episodes")
      .select(EPISODE_PLAY_SELECT)
      .eq("id", id)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .eq("podcast_shows.status", "approved")
      .eq("podcast_shows.is_active", true)
      .eq("podcast_shows.feed_status", "active");

    if (!allowMature) {
      request = request.eq("podcast_shows.is_mature", false);
    }

    const { data, error } = await request.maybeSingle();
    if (error) {
      logSupabaseError("GET /api/podcasts/:id/play", error, { id });
      return res.status(500).json({ error: "Failed to fetch podcast audio" });
    }

    if (!data?.audio_url) {
      return res.status(404).json({ error: "Podcast audio unavailable" });
    }

    logApiSuccess("GET /api/podcasts/:id/play", {
      durationMs: timer.durationMs(),
      resultCount: 1,
    });

    return res.json(normalizeEpisodePlay(data));
  } catch (error) {
    logApiError("GET /api/podcasts/:id/play", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      id,
    });
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
