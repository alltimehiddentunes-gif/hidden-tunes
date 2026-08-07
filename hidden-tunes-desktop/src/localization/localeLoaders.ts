import en from './locales/en'
import type { SupportedLocale, TranslationDictionary } from './types'

type LocaleModule = { default: TranslationDictionary }

export const localeLoaders: Record<SupportedLocale, () => Promise<LocaleModule>> = {
  en: async () => ({ default: en }),
  es: () => import('./locales/es') as unknown as Promise<LocaleModule>,
  fr: () => import('./locales/fr') as unknown as Promise<LocaleModule>,
  de: () => import('./locales/de') as unknown as Promise<LocaleModule>,
  pt: () => import('./locales/pt') as unknown as Promise<LocaleModule>,
  it: () => import('./locales/it') as unknown as Promise<LocaleModule>,
  nl: () => import('./locales/nl') as unknown as Promise<LocaleModule>,
  pl: () => import('./locales/pl') as unknown as Promise<LocaleModule>,
  ru: () => import('./locales/ru') as unknown as Promise<LocaleModule>,
  tr: () => import('./locales/tr') as unknown as Promise<LocaleModule>,
  ar: () => import('./locales/ar') as unknown as Promise<LocaleModule>,
  hi: () => import('./locales/hi') as unknown as Promise<LocaleModule>,
  'zh-CN': () => import('./locales/zh-CN') as unknown as Promise<LocaleModule>,
  'zh-TW': () => import('./locales/zh-TW') as unknown as Promise<LocaleModule>,
  ja: () => import('./locales/ja') as unknown as Promise<LocaleModule>,
  ko: () => import('./locales/ko') as unknown as Promise<LocaleModule>,
  id: () => import('./locales/id') as unknown as Promise<LocaleModule>,
  vi: () => import('./locales/vi') as unknown as Promise<LocaleModule>,
  th: () => import('./locales/th') as unknown as Promise<LocaleModule>,
  fil: () => import('./locales/fil') as unknown as Promise<LocaleModule>,
}

export async function loadLocaleDictionary(locale: SupportedLocale): Promise<TranslationDictionary> {
  return (await localeLoaders[locale]()).default
}
