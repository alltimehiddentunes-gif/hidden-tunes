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
  es: () =>
    import("./locales/es") as unknown as Promise<{ default: TranslationDictionary }>,
  fr: () =>
    import("./locales/fr") as unknown as Promise<{ default: TranslationDictionary }>,
  de: () =>
    import("./locales/de") as unknown as Promise<{ default: TranslationDictionary }>,
  pt: () =>
    import("./locales/pt") as unknown as Promise<{ default: TranslationDictionary }>,
  it: () =>
    import("./locales/it") as unknown as Promise<{ default: TranslationDictionary }>,
  nl: () =>
    import("./locales/nl") as unknown as Promise<{ default: TranslationDictionary }>,
  pl: () =>
    import("./locales/pl") as unknown as Promise<{ default: TranslationDictionary }>,
  ru: () =>
    import("./locales/ru") as unknown as Promise<{ default: TranslationDictionary }>,
  tr: () =>
    import("./locales/tr") as unknown as Promise<{ default: TranslationDictionary }>,
  ar: () =>
    import("./locales/ar") as unknown as Promise<{ default: TranslationDictionary }>,
  hi: () =>
    import("./locales/hi") as unknown as Promise<{ default: TranslationDictionary }>,
  "zh-CN": () =>
    import("./locales/zh-CN") as unknown as Promise<{
      default: TranslationDictionary;
    }>,
  "zh-TW": () =>
    import("./locales/zh-TW") as unknown as Promise<{
      default: TranslationDictionary;
    }>,
  ja: () =>
    import("./locales/ja") as unknown as Promise<{ default: TranslationDictionary }>,
  ko: () =>
    import("./locales/ko") as unknown as Promise<{ default: TranslationDictionary }>,
  id: () =>
    import("./locales/id") as unknown as Promise<{ default: TranslationDictionary }>,
  vi: () =>
    import("./locales/vi") as unknown as Promise<{ default: TranslationDictionary }>,
  th: () =>
    import("./locales/th") as unknown as Promise<{ default: TranslationDictionary }>,
  fil: () =>
    import("./locales/fil") as unknown as Promise<{ default: TranslationDictionary }>,
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
