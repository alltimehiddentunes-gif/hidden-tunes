import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { LocalizationContext } from './context'
import { loadLocaleDictionary } from './localeLoaders'
import en from './locales/en'
import { persistLocale, resolveInitialLocale } from './preference'
import { getTextDirection, isSupportedLocale } from './supportedLocales'
import { createTranslateFunction, isTranslationDictionary } from './translate'
import type { LocalizationContextValue, SupportedLocale, TranslationDictionary, TranslationKey, TranslationVariables } from './types'

export default function LocalizationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('en')
  const [isReady, setIsReady] = useState(false)
  const [isChangingLanguage, setIsChangingLanguage] = useState(false)
  const dictionaryRef = useRef<TranslationDictionary>(en)
  const generationRef = useRef(0)

  const activate = useCallback((nextLocale: SupportedLocale, dictionary: TranslationDictionary) => {
    dictionaryRef.current = dictionary
    setLocaleState(nextLocale)
    const direction = getTextDirection(nextLocale)
    document.documentElement.lang = nextLocale
    document.documentElement.dir = direction
  }, [])

  useEffect(() => {
    let cancelled = false
    const initial = resolveInitialLocale()
    void loadLocaleDictionary(initial)
      .then((dictionary) => {
        if (!cancelled && isTranslationDictionary(dictionary)) activate(initial, dictionary)
      })
      .catch(() => {
        if (!cancelled) activate('en', en)
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })
    return () => { cancelled = true }
  }, [activate])

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    if (!isSupportedLocale(nextLocale) || nextLocale === locale) return
    const generation = ++generationRef.current
    setIsChangingLanguage(true)
    try {
      const dictionary = await loadLocaleDictionary(nextLocale)
      if (generation !== generationRef.current || !isTranslationDictionary(dictionary)) return
      persistLocale(nextLocale)
      activate(nextLocale, dictionary)
    } finally {
      if (generation === generationRef.current) setIsChangingLanguage(false)
    }
  }, [activate, locale])

  const t = useCallback((key: TranslationKey, variables?: TranslationVariables) =>
    createTranslateFunction(dictionaryRef.current, en)(key, variables), [])

  const value = useMemo<LocalizationContextValue>(() => ({
    locale,
    direction: getTextDirection(locale),
    isReady,
    isChangingLanguage,
    t,
    setLocale,
  }), [isChangingLanguage, isReady, locale, setLocale, t])

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}
