import { isSupportedLocale } from "./supportedLocales";
import type { SupportedLocale } from "./types";

const LANGUAGE_ALIASES: Record<string, SupportedLocale> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt",
  it: "it",
  nl: "nl",
  pl: "pl",
  ru: "ru",
  tr: "tr",
  ar: "ar",
  hi: "hi",
  ja: "ja",
  ko: "ko",
  id: "id",
  vi: "vi",
  th: "th",
  fil: "fil",
  tl: "fil",
  "zh-hans": "zh-CN",
  "zh-cn": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-tw": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
};

function normalizeTag(raw: string): string {
  return raw.trim().replace(/_/g, "-").toLowerCase();
}

/**
 * Maps device or stored locale tags to a supported Hidden Tunes locale.
 * Unsupported values resolve to English.
 */
export function normalizeLocale(raw: string | null | undefined): SupportedLocale {
  if (!raw) return "en";

  const tag = normalizeTag(raw);
  if (!tag) return "en";

  if (isSupportedLocale(tag)) {
    return tag;
  }

  const direct = LANGUAGE_ALIASES[tag];
  if (direct) return direct;

  const base = tag.split("-")[0];
  if (isSupportedLocale(base)) {
    return base;
  }

  const baseAlias = LANGUAGE_ALIASES[base];
  if (baseAlias) return baseAlias;

  return "en";
}
