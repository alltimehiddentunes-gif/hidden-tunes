import type { SupportedLocale } from "./types";

export type LocaleDefinition = {
  code: SupportedLocale;
  nativeName: string;
  /** When false, locale is omitted from Settings until dictionary validation passes. */
  productionEnabled: boolean;
};

export const SUPPORTED_LOCALES: LocaleDefinition[] = [
  { code: "en", nativeName: "English", productionEnabled: true },
  { code: "es", nativeName: "Español", productionEnabled: true },
  { code: "fr", nativeName: "Français", productionEnabled: true },
  { code: "de", nativeName: "Deutsch", productionEnabled: true },
  { code: "pt", nativeName: "Português", productionEnabled: true },
  { code: "it", nativeName: "Italiano", productionEnabled: true },
  { code: "nl", nativeName: "Nederlands", productionEnabled: true },
  { code: "pl", nativeName: "Polski", productionEnabled: true },
  { code: "ru", nativeName: "Русский", productionEnabled: true },
  { code: "tr", nativeName: "Türkçe", productionEnabled: true },
  { code: "ar", nativeName: "العربية", productionEnabled: true },
  { code: "hi", nativeName: "हिन्दी", productionEnabled: true },
  { code: "zh-CN", nativeName: "简体中文", productionEnabled: true },
  { code: "zh-TW", nativeName: "繁體中文", productionEnabled: true },
  { code: "ja", nativeName: "日本語", productionEnabled: true },
  { code: "ko", nativeName: "한국어", productionEnabled: true },
  { code: "id", nativeName: "Bahasa Indonesia", productionEnabled: true },
  { code: "vi", nativeName: "Tiếng Việt", productionEnabled: true },
  { code: "th", nativeName: "ไทย", productionEnabled: true },
  { code: "fil", nativeName: "Filipino", productionEnabled: true },
];

export const SUPPORTED_LOCALE_CODES = SUPPORTED_LOCALES.map((entry) => entry.code);

export const PRODUCTION_LOCALES = SUPPORTED_LOCALES.filter(
  (entry) => entry.productionEnabled
);

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return SUPPORTED_LOCALE_CODES.includes(value as SupportedLocale);
}

export function getLocaleNativeName(code: SupportedLocale): string {
  return SUPPORTED_LOCALES.find((entry) => entry.code === code)?.nativeName ?? code;
}

export function getTextDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
