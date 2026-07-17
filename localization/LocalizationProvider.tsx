import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as SplashScreen from "expo-splash-screen";

import { LocalizationContext } from "./context";
import { loadLocaleDictionary } from "./localeLoaders";
import enDictionary from "./locales/en";
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

/**
 * English is bundled synchronously so the first paint never falls back to raw keys.
 * Persisted / device locale is resolved asynchronously, then applied before the
 * splash is dismissed and children mount.
 */
export default function LocalizationProvider({
  children,
}: LocalizationProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>("en");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [isReady, setIsReady] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [englishDictionary] = useState<TranslationDictionary>(enDictionary);
  const [activeDictionary, setActiveDictionary] =
    useState<TranslationDictionary>(enDictionary);

  const localeRef = useRef<SupportedLocale>("en");
  const activeDictionaryRef = useRef<TranslationDictionary>(enDictionary);
  const englishDictionaryRef = useRef<TranslationDictionary>(enDictionary);
  const switchGenerationRef = useRef(0);
  const splashHiddenRef = useRef(false);

  const hideSplashOnce = useCallback(async () => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    try {
      await SplashScreen.hideAsync();
    } catch {
      // Splash may already be hidden on fast reload — safe to ignore.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      englishDictionaryRef.current = enDictionary;

      try {
        const initialLocale = await resolveInitialLocale();
        if (cancelled) return;

        if (initialLocale === "en") {
          localeRef.current = "en";
          activeDictionaryRef.current = enDictionary;
          setLocaleState("en");
          setActiveDictionary(enDictionary);
          setDirection(getTextDirection("en"));
          setIsReady(true);
          return;
        }

        if (!isSupportedLocale(initialLocale)) {
          localeRef.current = "en";
          activeDictionaryRef.current = enDictionary;
          setLocaleState("en");
          setActiveDictionary(enDictionary);
          setDirection("ltr");
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
        localeRef.current = "en";
        activeDictionaryRef.current = enDictionary;
        setLocaleState("en");
        setActiveDictionary(enDictionary);
        setDirection("ltr");
        setIsReady(true);
      } finally {
        if (!cancelled) {
          await hideSplashOnce();
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hideSplashOnce]);

  // Safety net: never leave the splash stuck if bootstrap stalls.
  useEffect(() => {
    if (isReady) return;
    const timeout = setTimeout(() => {
      if (splashHiddenRef.current) return;
      englishDictionaryRef.current = enDictionary;
      activeDictionaryRef.current = enDictionary;
      setActiveDictionary(enDictionary);
      setLocaleState("en");
      setDirection("ltr");
      setIsReady(true);
      void hideSplashOnce();
    }, 2500);
    return () => clearTimeout(timeout);
  }, [hideSplashOnce, isReady]);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    if (!isSupportedLocale(nextLocale)) return;

    const generation = ++switchGenerationRef.current;
    setIsChangingLanguage(true);

    try {
      const english = englishDictionaryRef.current ?? enDictionary;
      englishDictionaryRef.current = english;

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

  const t = useCallback((key: TranslationKey, variables?: TranslationVariables) => {
    const english = englishDictionaryRef.current ?? enDictionary;
    const active = activeDictionaryRef.current ?? english;
    return createTranslateFunction(active, english)(key, variables);
  }, []);

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

  // Centralized gate: do not mount Home / navigation until a valid dictionary is active.
  if (!isReady) {
    return (
      <LocalizationContext.Provider value={value}>
        {null}
      </LocalizationContext.Provider>
    );
  }

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}
