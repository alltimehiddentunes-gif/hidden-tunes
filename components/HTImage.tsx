import { Image } from "expo-image";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet, View } from "react-native";

import {
  FALLBACK_ARTWORK,
  FALLBACK_ARTWORK_ASSET,
  getArtworkCandidates,
  getArtworkValue,
  isArtworkUrlFailed,
  markArtworkUrlFailed,
} from "../utils/artwork";
import { recordArtworkFailure } from "../utils/performanceLogs";
import { isFastScrolling } from "../utils/performanceMode";

type Props = {
  uri?: string | null;
  source?: any;
  candidates?: any[];
  fallback?: any;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  contentPosition?: "center" | "top" | "bottom" | "left" | "right";
  /** Off by default — list rows should not prefetch offscreen artwork. */
  prefetch?: boolean;
};

const MAX_ARTWORK_CANDIDATES = 5;
const IMAGE_SOURCE_CACHE_LIMIT = 240;
const imageSourceCache = new Map<string, { uri: string }>();

function memoizedUriSource(uri: string) {
  const normalized = String(uri || "").trim();
  if (!normalized) return FALLBACK_ARTWORK_ASSET;

  const cached = imageSourceCache.get(normalized);
  if (cached) return cached;

  const source = { uri: normalized };
  imageSourceCache.set(normalized, source);
  if (imageSourceCache.size > IMAGE_SOURCE_CACHE_LIMIT) {
    const oldest = imageSourceCache.keys().next().value;
    if (oldest) imageSourceCache.delete(oldest);
  }

  return source;
}
const IMAGE_FADE_MS = 220;

function candidateKey(item: any) {
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);

  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

function flattenStyle(style?: StyleProp<ImageStyle>) {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean));
  }
  return style as Record<string, unknown>;
}

function HTImage({
  uri,
  source,
  candidates,
  fallback = FALLBACK_ARTWORK,
  style,
  contentFit = "cover",
  contentPosition = "center",
  prefetch = false,
}: Props) {
  const fallbackSource = useMemo(() => {
    if (fallback === FALLBACK_ARTWORK || fallback === FALLBACK_ARTWORK_ASSET) {
      return FALLBACK_ARTWORK_ASSET;
    }
    const artwork = getArtworkValue(fallback, FALLBACK_ARTWORK);
    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [fallback]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [stablePlaceholder, setStablePlaceholder] = useState<any>(fallbackSource);
  const [showingFallback, setShowingFallback] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const failureCountRef = useRef(0);
  const gaveUpRef = useRef(false);
  const prefetchedUriRef = useRef("");

  const flatStyle = useMemo(() => flattenStyle(style), [style]);
  const borderRadius = Number(flatStyle.borderRadius || 0);

  const resolvedCandidates = useMemo(() => {
    const explicitCandidates = Array.isArray(candidates)
      ? candidates.flatMap((candidate) => getArtworkCandidates(candidate, fallback))
      : [];
    const candidate = source ?? uri;
    const implicitCandidates = getArtworkCandidates(candidate, fallback);
    const combined = [...explicitCandidates, ...implicitCandidates, fallback];
    const seen = new Set<string>();

    return combined
      .filter((item) => {
        const key = candidateKey(item);
        if (!key || seen.has(key)) return false;
        if (typeof item === "string" && isArtworkUrlFailed(item)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_ARTWORK_CANDIDATES);
  }, [candidates, fallback, source, uri]);

  const resolvedSource = useMemo(() => {
    const candidate = resolvedCandidates[candidateIndex] || fallback;
    const artwork = getArtworkValue(candidate, fallback);

    if (artwork === FALLBACK_ARTWORK) {
      return FALLBACK_ARTWORK_ASSET;
    }

    if (typeof artwork === "string") {
      return memoizedUriSource(artwork);
    }

    return artwork;
  }, [candidateIndex, fallback, resolvedCandidates]);

  const recyclingKey = useMemo(() => {
    const key = candidateKey(resolvedSource);
    return key || "fallback-artwork";
  }, [resolvedSource]);

  useEffect(() => {
    setCandidateIndex(0);
    failureCountRef.current = 0;
    gaveUpRef.current = false;
    setShowingFallback(false);
    setImageReady(false);
  }, [candidates, source, uri]);

  useEffect(() => {
    const uriValue =
      typeof resolvedSource === "object" && resolvedSource?.uri
        ? String(resolvedSource.uri)
        : typeof resolvedSource === "string"
          ? resolvedSource
          : FALLBACK_ARTWORK;

    setShowingFallback(!uriValue || uriValue === FALLBACK_ARTWORK || gaveUpRef.current);
  }, [resolvedSource]);

  useEffect(() => {
    setStablePlaceholder((current: any) => current || fallbackSource);
  }, [fallbackSource]);

  useEffect(() => {
    if (!prefetch) return;

    const uriValue =
      typeof resolvedSource === "object" && resolvedSource?.uri
        ? String(resolvedSource.uri)
        : typeof resolvedSource === "string"
          ? resolvedSource
          : "";

    if (
      !uriValue ||
      uriValue === FALLBACK_ARTWORK ||
      uriValue === prefetchedUriRef.current ||
      isFastScrolling()
    ) {
      return;
    }

    prefetchedUriRef.current = uriValue;
    void Image.prefetch(uriValue).catch(() => undefined);
  }, [prefetch, resolvedSource]);

  const fastScrolling = isFastScrolling();

  return (
    <View
      style={[
        styles.frame,
        {
          borderRadius,
          width: flatStyle.width,
          height: flatStyle.height,
        },
        showingFallback && styles.fallbackFrame,
      ]}
    >
      <Image
        source={resolvedSource}
        recyclingKey={recyclingKey}
        style={[
          style,
          styles.image,
          !imageReady && !showingFallback ? styles.imageLoading : null,
        ]}
        contentFit={contentFit}
        contentPosition={contentPosition}
        cachePolicy="disk"
        placeholder={stablePlaceholder || fallbackSource}
        placeholderContentFit="cover"
        transition={fastScrolling || showingFallback ? 0 : IMAGE_FADE_MS}
        onLoad={() => {
          setImageReady(true);
          if (!fastScrolling) {
            setStablePlaceholder(resolvedSource);
          }
        }}
        onError={() => {
          if (gaveUpRef.current) return;

          const failedUrl =
            typeof resolvedSource === "object" && resolvedSource?.uri
              ? String(resolvedSource.uri)
              : typeof resolvedSource === "string"
                ? resolvedSource
                : "";

          if (failedUrl && failedUrl !== FALLBACK_ARTWORK) {
            markArtworkUrlFailed(failedUrl);
          }

          failureCountRef.current += 1;

          if (__DEV__ && failureCountRef.current === 1) {
            recordArtworkFailure({
              candidateIndex,
              candidates: resolvedCandidates.length,
            });
          }

          const nextIndex = candidateIndex + 1;
          if (nextIndex >= resolvedCandidates.length) {
            gaveUpRef.current = true;
            setShowingFallback(true);
            setCandidateIndex(resolvedCandidates.length - 1);
            return;
          }

          setCandidateIndex(nextIndex);
        }}
      />
    </View>
  );
}

export default memo(HTImage);

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    backgroundColor: "rgba(168,85,247,0.06)",
  },
  fallbackFrame: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  image: {
    backgroundColor: "transparent",
  },
  imageLoading: {
    opacity: 0.88,
  },
});
