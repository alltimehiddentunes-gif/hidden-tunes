export type ParsedRssEpisode = {
  guid: string;
  title: string;
  description: string;
  pubDate?: string;
  audioUrl?: string;
  audioType?: string;
  durationSeconds?: number;
  imageUrl?: string;
  link?: string;
  isExplicit?: boolean;
};

export type ParsedRssFeed = {
  title: string;
  description: string;
  imageUrl?: string;
  link?: string;
  language?: string;
  isExplicit?: boolean;
  episodes: ParsedRssEpisode[];
};

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractTag(block: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function extractAttr(block: string, tag: string, attr: string) {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*\\/?>`, "i");
  const match = block.match(regex);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function parseDurationToSeconds(raw?: string) {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (/^\d+$/.test(clean)) return Number(clean);
  const parts = clean.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

function parseEnclosure(block: string) {
  const url = extractAttr(block, "enclosure", "url");
  const type = extractAttr(block, "enclosure", "type");
  if (!url) return undefined;
  return { url, type };
}

function parseMediaContent(block: string) {
  const url = extractAttr(block, "media:content", "url");
  const type = extractAttr(block, "media:content", "type");
  if (!url) return undefined;
  return { url, type };
}

const PODCAST_AUDIO_HOST =
  /megaphone\.fm|simplecast\.com|podtrac\.com|blubrry\.com|acast\.com|libsyn\.com|spreaker\.com|anchor\.fm|buzzsprout\.com|omnycontent\.com|art19\.com/i;

function isSupportedAudio(url: string, type?: string) {
  const lower = `${url} ${type || ""}`.toLowerCase();
  if (lower.includes("audio/")) return true;
  return (
    lower.includes(".mp3") ||
    lower.includes(".m4a") ||
    lower.includes(".aac") ||
    lower.includes(".ogg") ||
    lower.includes("audio/mpeg") ||
    lower.includes("audio/mp4") ||
    lower.includes("audio/aac") ||
    lower.includes("audio/ogg") ||
    PODCAST_AUDIO_HOST.test(url)
  );
}

function splitItems(xml: string, maxItems: number) {
  const items: string[] = [];
  const pattern = /<item[\s\S]*?<\/item>/gi;
  let match = pattern.exec(xml);
  while (match && items.length < maxItems) {
    items.push(match[0]);
    match = pattern.exec(xml);
  }
  return items;
}

export function parseRssFeed(xml: string, maxItems = 10): ParsedRssFeed | null {
  try {
    const channelMatch = xml.match(/<channel[\s\S]*?<\/channel>/i);
    const channel = channelMatch ? channelMatch[0] : xml;

    const title = extractTag(channel, "title") || "Untitled Podcast";
    const description = extractTag(channel, "description") || "";
    const link = extractTag(channel, "link");
    const language = extractTag(channel, "language");

    const imageUrl =
      extractAttr(channel, "itunes:image", "href") ||
      extractTag(channel, "url") ||
      extractTag(channel, "image");

    const channelExplicit = extractTag(channel, "itunes:explicit");
    const isExplicit = channelExplicit?.toLowerCase() === "yes" || channelExplicit === "true";

    const episodes: ParsedRssEpisode[] = [];

    for (const itemBlock of splitItems(channel, maxItems)) {
      const guid = extractTag(itemBlock, "guid") || extractTag(itemBlock, "link") || "";
      const itemTitle = extractTag(itemBlock, "title") || "Untitled Episode";
      const itemDescription =
        extractTag(itemBlock, "description") || extractTag(itemBlock, "itunes:summary") || "";
      const pubDate = extractTag(itemBlock, "pubDate");
      const itemLink = extractTag(itemBlock, "link");
      const enclosure = parseEnclosure(itemBlock) || parseMediaContent(itemBlock);
      const durationSeconds = parseDurationToSeconds(extractTag(itemBlock, "itunes:duration"));
      const imageUrlItem =
        extractAttr(itemBlock, "itunes:image", "href") || extractTag(itemBlock, "image");
      const itemExplicit = extractTag(itemBlock, "itunes:explicit");
      const episodeExplicit =
        itemExplicit?.toLowerCase() === "yes" || itemExplicit === "true" || isExplicit;

      if (!enclosure?.url || !isSupportedAudio(enclosure.url, enclosure.type)) {
        continue;
      }

      episodes.push({
        guid: guid || `${itemTitle}-${pubDate || itemLink || episodes.length}`,
        title: itemTitle,
        description: itemDescription,
        pubDate,
        audioUrl: enclosure.url,
        audioType: enclosure.type,
        durationSeconds,
        imageUrl: imageUrlItem || imageUrl,
        link: itemLink,
        isExplicit: episodeExplicit,
      });
    }

    return {
      title,
      description,
      imageUrl,
      link,
      language,
      isExplicit,
      episodes,
    };
  } catch {
    return null;
  }
}

export async function fetchRssXml(feedUrl: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
