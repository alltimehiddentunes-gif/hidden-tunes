export { default as LocalizationProvider } from "./LocalizationProvider";
export { useLocalization, useLocalizationOptional } from "./context";
export { normalizeLocale } from "./normalizeLocale";
export { detectDeviceLocale } from "./detectLocale";
export {
  SUPPORTED_LOCALES,
  PRODUCTION_LOCALES,
  getLocaleNativeName,
  isSupportedLocale,
} from "./supportedLocales";
export { SELECTED_LOCALE_STORAGE_KEY } from "./preference";
export type {
  SupportedLocale,
  TranslationKey,
  LocalizationContextValue,
} from "./types";
