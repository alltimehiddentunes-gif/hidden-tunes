import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LocalizationContext } from "./context";
import { loadLocaleDictionary } from "./localeLoaders";
import {
  markUserSelectedLocale,
  persistLocale,
  resolveInitialLocale,
} from "./preference";
import { getTextDirection, isSupportedLocale } from "./supportedLocales";
import {
  createTranslateFunction,
  isTranslationDictionary,
} from "./translate";
import type {
  LocalizationContextValue,
  SupportedLocale,
  TranslationDictionary,
  TranslationKey,
  TranslationVariables,
} from "./types";

type LocalizationProviderProps = {
  children: ReactNode;
};

export default function LocalizationProvider({
  children,
}: LocalizationProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>("en");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [isReady, setIsReady] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [englishDictionary, setEnglishDictionary] =
    useState<TranslationDictionary | null>(null);
  const [activeDictionary, setActiveDictionary] =
    useState<TranslationDictionary | null>(null);

  const localeRef = useRef<SupportedLocale>("en");
  const activeDictionaryRef = useRef<TranslationDictionary | null>(null);
  const englishDictionaryRef = useRef<TranslationDictionary | null>(null);
  const switchGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const initialLocale = await resolveInitialLocale();
        const english = await loadLocaleDictionary("en");
        if (cancelled) return;

        englishDictionaryRef.current = english;
        setEnglishDictionary(english);

        if (initialLocale === "en") {
          localeRef.current = "en";
          activeDictionaryRef.current = english;
          setLocaleState("en");
          setActiveDictionary(english);
          setDirection(getTextDirection("en"));
          setIsReady(true);
          return;
        }

        const selected = await loadLocaleDictionary(initialLocale);
        if (cancelled) return;

        if (!isTranslationDictionary(selected)) {
          throw new Error("Invalid selected dictionary");
        }

        localeRef.current = initialLocale;
        activeDictionaryRef.current = selected;
        setLocaleState(initialLocale);
        setActiveDictionary(selected);
        setDirection(getTextDirection(initialLocale));
        setIsReady(true);
      } catch {
        if (cancelled) return;

        try {
          const english = englishDictionaryRef.current ?? (await loadLocaleDictionary("en"));
          if (cancelled) return;
          englishDictionaryRef.current = english;
          setEnglishDictionary(english);
          localeRef.current = "en";
          activeDictionaryRef.current = english;
          setLocaleState("en");
          setActiveDictionary(english);
          setDirection("ltr");
        } catch {
          // English load failure is extremely unlikely.
        } finally {
          if (!cancelled) setIsReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    if (!isSupportedLocale(nextLocale)) return;

    const generation = ++switchGenerationRef.current;
    setIsChangingLanguage(true);

    try {
      const english =
        englishDictionaryRef.current ?? (await loadLocaleDictionary("en"));
      if (generation !== switchGenerationRef.current) return;

      englishDictionaryRef.current = english;
      setEnglishDictionary(english);

      const nextDictionary =
        nextLocale === "en" ? english : await loadLocaleDictionary(nextLocale);
      if (generation !== switchGenerationRef.current) return;

      if (!isTranslationDictionary(nextDictionary)) {
        throw new Error("Invalid dictionary payload");
      }

      await persistLocale(nextLocale);
      markUserSelectedLocale();

      localeRef.current = nextLocale;
      activeDictionaryRef.current = nextDictionary;
      setLocaleState(nextLocale);
      setActiveDictionary(nextDictionary);
      setDirection(getTextDirection(nextLocale));
    } catch {
      // Keep current language active on failure.
    } finally {
      if (generation === switchGenerationRef.current) {
        setIsChangingLanguage(false);
      }
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, variables?: TranslationVariables) => {
      const active = activeDictionaryRef.current;
      const english = englishDictionaryRef.current;

      if (!active || !english) {
        return key;
      }

      return createTranslateFunction(active, english)(key, variables);
    },
    []
  );

  const value = useMemo<LocalizationContextValue>(
    () => ({
      locale,
      direction,
      isReady,
      isChangingLanguage,
      t,
      setLocale,
    }),
    [direction, isChangingLanguage, isReady, locale, setLocale, t]
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}
