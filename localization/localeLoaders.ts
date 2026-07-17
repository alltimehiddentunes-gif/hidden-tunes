import en from "./locales/en";
import type { SupportedLocale } from "./types";
import type { TranslationDictionary } from "./types";

export type LocaleLoader = () => Promise<{ default: TranslationDictionary }>;

/**
 * Lazy loader registry — non-English locales are imported on demand.
 * English is available synchronously via the static import above so first paint
 * never depends on a dynamic import race.
 */
export const localeLoaders: Record<SupportedLocale, LocaleLoader> = {
  en: async () => ({ default: en }),
  es: () => import("./locales/es"),
  fr: () => import("./locales/fr"),
  de: () => import("./locales/de"),
  pt: () => import("./locales/pt"),
  it: () => import("./locales/it"),
  nl: () => import("./locales/nl"),
  pl: () => import("./locales/pl"),
  ru: () => import("./locales/ru"),
  tr: () => import("./locales/tr"),
  ar: () => import("./locales/ar"),
  hi: () => import("./locales/hi"),
  "zh-CN": () => import("./locales/zh-CN"),
  "zh-TW": () => import("./locales/zh-TW"),
  ja: () => import("./locales/ja"),
  ko: () => import("./locales/ko"),
  id: () => import("./locales/id"),
  vi: () => import("./locales/vi"),
  th: () => import("./locales/th"),
  fil: () => import("./locales/fil"),
};

export async function loadLocaleDictionary(
  locale: SupportedLocale
): Promise<TranslationDictionary> {
  if (locale === "en") return en;
  const module = await localeLoaders[locale]();
  return module.default;
}

/** Synchronous English dictionary for bootstrap / first-frame safety. */
export function getBundledEnglishDictionary(): TranslationDictionary {
  return en;
}
