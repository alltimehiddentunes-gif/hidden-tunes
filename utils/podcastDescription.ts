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
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
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
    })
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
    });
}

function stripTrackingUrls(value: string) {
  return value
    .replace(/https?:\/\/[^\s)]+/gi, (url) => {
      if (/podtrac|doubleclick|google-analytics|utm_|fbclid/i.test(url)) {
        return "";
      }
      return "";
    })
    .replace(/\bwww\.[^\s)]+/gi, "");
}

export function cleanPodcastDescription(raw?: string | null): string {
  if (!raw) return "";

  let text = String(raw);

  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n\n");
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  text = text.replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text);
  text = stripTrackingUrls(text);

  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
