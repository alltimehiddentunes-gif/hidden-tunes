export type AudiobookExternalLink = {
  label: string;
  url: string;
};

export type SanitizedAudiobookDescription = {
  text: string | null;
  links: AudiobookExternalLink[];
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "(c)",
  gt: ">",
  hellip: "...",
  laquo: "<<",
  ldquo: "\"",
  lsquo: "'",
  lt: "<",
  mdash: "-",
  ndash: "-",
  nbsp: " ",
  quot: "\"",
  raquo: ">>",
  rdquo: "\"",
  rsquo: "'",
};

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const key = String(entity || "").toLowerCase();
    if (key.startsWith("#x")) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (key.startsWith("#")) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[key] || match;
  });
}

function normalizeUrl(value: string) {
  const decoded = decodeHtmlEntities(value).trim();
  try {
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeLabel(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function sanitizeAudiobookDescription(
  value: unknown
): SanitizedAudiobookDescription {
  if (typeof value !== "string") return { text: null, links: [] };

  const links: AudiobookExternalLink[] = [];
  let text = value;

  text = text.replace(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href, label) => {
      const url = normalizeUrl(String(href || ""));
      const cleanLabel = normalizeLabel(String(label || ""));
      if (url) {
        links.push({
          label: cleanLabel || url,
          url,
        });
      }
      return cleanLabel;
    }
  );

  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*p\b[^>]*>/gi, "")
    .replace(/<\/?\s*(em|i|strong|b)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const seen = new Set<string>();
  const dedupedLinks = links.filter((link) => {
    const key = `${link.url}:${link.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    text: text || null,
    links: dedupedLinks,
  };
}

export function cleanAudiobookDescription(value: unknown) {
  return sanitizeAudiobookDescription(value).text;
}

export function hasMalformedAudiobookDescription(value: unknown) {
  return (
    typeof value === "string" &&
    /<\s*\/?\s*[a-z][^>]*>|&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/i.test(value)
  );
}
