import { cleanText } from "@/lib/tvCatalog";

const LANGUAGE_ALIASES: Record<string, string> = {
  "en-us": "en",
  "en-gb": "en",
  "en-au": "en",
  "en-ca": "en",
  "en_us": "en",
  "en_gb": "en",
  "eng": "en",
  "es-es": "es",
  "es-mx": "es",
  "es-419": "es",
  "pt-br": "pt",
  "pt-pt": "pt",
  "zh-cn": "zh",
  "zh-tw": "zh",
  "zh-hans": "zh",
  "zh-hant": "zh",
};

export function normalizePodcastLanguage(value: unknown) {
  const raw = cleanText(value, 40);
  if (!raw) return null;

  const lower = raw.toLowerCase().replace(/_/g, "-");
  const primary = lower.split("-")[0] || lower;
  return LANGUAGE_ALIASES[lower] || LANGUAGE_ALIASES[primary] || primary;
}

export function normalizePodcastCountryCode(value: unknown) {
  const raw = cleanText(value, 8);
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return null;
}

export function normalizePodcastTitleKey(title: string | null | undefined) {
  const text = cleanText(title, 300);
  if (!text) return null;

  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parsePodcastExplicitFlag(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  const text = cleanText(value, 20)?.toLowerCase();
  if (!text) return null;
  if (text === "yes" || text === "true" || text === "explicit") return true;
  if (text === "no" || text === "false" || text === "clean") return false;
  return null;
}

export function normalizePodcastWebsiteUrl(value: unknown) {
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

export function normalizePodcastCopyright(value: unknown) {
  return cleanText(value, 500);
}
