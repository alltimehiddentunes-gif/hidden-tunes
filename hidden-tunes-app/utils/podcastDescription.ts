const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

const TRACKING_URL_PATTERN =
  /\bhttps?:\/\/(?:www\.)?(?:podtrac\.com|chtbl\.com|mgln\.eu|pdst\.fm|op3\.dev|podscribe\.com|claritaspodcast\.com|traffic\.megaphone\.fm)[^\s]*/gi;

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function preserveParagraphSpacing(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

export function cleanPodcastDescription(raw?: string | null) {
  if (!raw) return "";

  let text = String(raw);

  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n");

  text = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  text = text.replace(/<[^>]+>/g, " ");

  text = text.replace(
    /\b(?:style|target|rel|class|id)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    " "
  );

  text = decodeHtmlEntities(text);
  text = text.replace(TRACKING_URL_PATTERN, " ");
  text = preserveParagraphSpacing(text);

  return text.trim();
}
