import { Image } from "expo-image";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { ImageStyle, StyleProp } from "react-native";

import {
  FALLBACK_ARTWORK,
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
};

const MAX_ARTWORK_CANDIDATES = 4;

function candidateKey(item: any) {
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);

  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

function HTImage({
  uri,
  source,
  candidates,
  fallback = FALLBACK_ARTWORK,
  style,
  contentFit = "cover",
}: Props) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [stablePlaceholder, setStablePlaceholder] = useState<any>(null);
  const [fastScrolling, setFastScrolling] = useState(isFastScrolling());
  const failureCountRef = useRef(0);
  const gaveUpRef = useRef(false);

  const fallbackSource = useMemo(() => {
    const artwork = getArtworkValue(fallback, FALLBACK_ARTWORK);
    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [fallback]);

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

    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [candidateIndex, fallback, resolvedCandidates]);

  const recyclingKey = useMemo(() => {
    const key = candidateKey(resolvedSource);
    return key || "fallback-artwork";
  }, [resolvedSource]);

  useEffect(() => {
    setCandidateIndex(0);
    failureCountRef.current = 0;
    gaveUpRef.current = false;
  }, [candidates, source, uri]);

  useEffect(() => {
    if (!stablePlaceholder) {
      setStablePlaceholder(fallbackSource);
    }
  }, [fallbackSource, stablePlaceholder]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = isFastScrolling();
      setFastScrolling((current) => (current === next ? current : next));
    }, 200);

    return () => clearInterval(timer);
  }, []);

  return (
    <Image
      source={resolvedSource}
      recyclingKey={recyclingKey}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      placeholder={stablePlaceholder || fallbackSource}
      transition={fastScrolling ? 0 : 180}
      onLoad={() => {
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
          setCandidateIndex(resolvedCandidates.length - 1);
          return;
        }

        setCandidateIndex(nextIndex);
      }}
    />
  );
}

export default memo(HTImage);
