/**
 * Display-only Motivationals text helpers.
 * Keep original API strings in memory when needed; never mutate source catalogs.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    return HTML_ENTITY_MAP[key] ?? match;
  });
}

/** Strip HTML and LibriVox/source boilerplate for safe plain-text UI. */
export function sanitizeMotivationDescription(raw?: string | null): string {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n\n");
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  text = text.replace(/https?:\/\/[^\s)]+/gi, "");
  // Common LibriVox footer noise
  text = text.replace(
    /For further information, including links to online text[\s\S]*$/i,
    ""
  );
  text = text.replace(/For more free audio books[\s\S]*$/i, "");
  text = text.replace(/M4B Audiobook\s*\([^)]*\)/gi, "");
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

const TECHNICAL_SUFFIX_RE =
  /\b(?:\d{2,3}\s*kb(?:ps)?|_?mono|_?stereo|\.mp3|\.m4a|\.ogg|\.wav)\b/gi;

/** Remove bitrate/file technical suffixes without destroying real title words. */
export function sanitizeMotivationTitle(raw?: string | null): string {
  if (!raw) return "Untitled";
  let title = decodeHtmlEntities(String(raw)).replace(/<[^>]+>/g, " ").trim();
  title = title.replace(TECHNICAL_SUFFIX_RE, " ");
  title = title.replace(/\s{2,}/g, " ").trim();
  title = title.replace(/[\s._-]+$/g, "").trim();
  return title || "Untitled";
}

/**
 * Canonical program/series title for grouping.
 * "The Blue Wound — bluewound 01 garrett 128kb" → "The Blue Wound"
 */
export function extractMotivationProgramTitle(rawTitle?: string | null): string {
  const cleaned = sanitizeMotivationTitle(rawTitle);
  const split = cleaned.split(/\s+[—–-]\s+/);
  if (split.length >= 2) {
    const head = split[0].trim();
    if (head.length >= 3) return head;
  }
  // "Title 01" / "Title Part 2"
  const numbered = cleaned.replace(
    /\s+(?:part|chapter|ep(?:isode)?|vol(?:ume)?|book|disc)?\s*#?\d+\s*$/i,
    ""
  );
  if (numbered.length >= 3 && numbered !== cleaned) return numbered.trim();
  return cleaned;
}

export function extractEpisodeNumberFromTitle(rawTitle?: string | null): number | null {
  const title = String(rawTitle || "");
  const patterns = [
    /\b(?:episode|ep|chapter|ch|part|pt|track|disc|volume|vol)\s*#?0*(\d{1,4})\b/i,
    /\b0*(\d{1,4})\s*(?:of\s+\d+)?\b/,
    /[\s_-]0*(\d{1,4})(?:[\s_-]|$)/,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 0 && n < 10000) return n;
    }
  }
  return null;
}

export function extractVolumeNumberFromTitle(rawTitle?: string | null): number | null {
  const title = String(rawTitle || "");
  const match = title.match(/\b(?:volume|vol|season|book|disc)\s*#?0*(\d{1,3})\b/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * User-facing episode title. Collapses Archive/LibriVox technical right-hand titles
 * such as "The Blue Wound — bluewound 01 garrett 128kb" into "Episode 1".
 */
export function formatMotivationEpisodeTitle(rawTitle?: string | null): string {
  const cleaned = sanitizeMotivationTitle(rawTitle);
  const program = extractMotivationProgramTitle(rawTitle);
  const episode = extractEpisodeNumberFromTitle(rawTitle);
  if (/\s+[—–-]\s+/.test(String(rawTitle || cleaned))) {
    const right = cleaned.split(/\s+[—–-]\s+/).slice(1).join(" ");
    const looksTechnical =
      /\b\d{2,3}\s*kb\b/i.test(String(rawTitle || "")) ||
      /\b(?:mono|stereo|garrett|librivox)\b/i.test(right) ||
      /^[a-z0-9]+(?:\s+\d+)+\s+[a-z]+$/i.test(right.trim());
    if (looksTechnical) {
      return episode != null ? `Episode ${episode}` : program;
    }
  }
  return cleaned;
}

/** Soft client filter for fiction LibriVox audiobooks misplaced into Motivationals. */
export function isLikelyMisplacedAudiobook(item: {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  category?: string | null;
  category_slug?: string | null;
}): boolean {
  const tags = (item.tags || []).map((t) => String(t).toLowerCase());
  const haystack = `${item.title || ""} ${item.description || ""} ${tags.join(" ")}`.toLowerCase();
  const hasFiction = tags.includes("fiction") || /\bfiction\b|\bnovel\b|\bshort stories\b/.test(haystack);
  const hasLibrivox =
    tags.includes("librivox") ||
    tags.some((t) => t.startsWith("librivox-")) ||
    /\blibrivox\b/.test(haystack);
  const hasAudiobookTag = tags.includes("audiobooks") || tags.includes("audiobook");
  const isSelfHelp =
    /\bself[- ]?help\b|\bpersonal growth\b|\bconduct of life\b|\bmotivational\b|\binspirational speech\b/.test(
      haystack
    );

  if (hasLibrivox && hasFiction && !isSelfHelp) return true;
  if (hasLibrivox && hasAudiobookTag && hasFiction) return true;
  if (
    /librivox recording of/i.test(String(item.description || "")) &&
    hasFiction &&
    !isSelfHelp
  ) {
    return true;
  }
  return false;
}

export function slugifyMotivationKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function naturalCompareMotivation(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
