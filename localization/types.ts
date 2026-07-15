import type en from "./locales/en";

export type TranslationDictionary = typeof en;

export type TranslationKey = JoinKeys<TranslationDictionary>;

type JoinKeys<T, Prefix extends string = ""> = T extends string
  ? Prefix extends ""
    ? never
    : Prefix
  : {
      [K in keyof T & string]: T[K] extends string
        ? Prefix extends ""
          ? K
          : `${Prefix}.${K}`
        : JoinKeys<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>;
    }[keyof T & string];

export type TranslationVariables = Record<string, string | number>;

export type SupportedLocale =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it"
  | "nl"
  | "pl"
  | "ru"
  | "tr"
  | "ar"
  | "hi"
  | "zh-CN"
  | "zh-TW"
  | "ja"
  | "ko"
  | "id"
  | "vi"
  | "th"
  | "fil";

export type TextDirection = "ltr" | "rtl";

export type LocalizationContextValue = {
  locale: SupportedLocale;
  direction: TextDirection;
  isReady: boolean;
  isChangingLanguage: boolean;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
  setLocale: (locale: SupportedLocale) => Promise<void>;
};
