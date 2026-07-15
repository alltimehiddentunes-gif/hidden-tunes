import type { SupportedLocale } from "./types";
import type { TranslationDictionary } from "./types";

export type LocaleLoader = () => Promise<{ default: TranslationDictionary }>;

/**
 * Lazy loader registry — only the selected locale (plus English fallback) is
 * imported at runtime. Metro may still bundle locale modules; they are not
 * parsed or retained in React state until explicitly loaded.
 */
export const localeLoaders: Record<SupportedLocale, LocaleLoader> = {
  en: () => import("./locales/en"),
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
  const module = await localeLoaders[locale]();
  return module.default;
}
