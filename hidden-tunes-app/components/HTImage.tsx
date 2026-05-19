import { Image } from "expo-image";
import React, { memo, useEffect, useMemo, useState } from "react";
import { ImageStyle, StyleProp } from "react-native";

import {
  FALLBACK_ARTWORK,
  getArtworkCandidates,
  getArtworkValue,
} from "../utils/artwork";
import { recordArtworkFailure } from "../utils/performanceLogs";

type Props = {
  uri?: string | null;
  source?: any;
  candidates?: any[];
  fallback?: any;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
};

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

    return combined.filter((item) => {
      const key = candidateKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [candidates, fallback, source, uri]);

  const resolvedSource = useMemo(() => {
    const candidate = resolvedCandidates[candidateIndex] || fallback;
    const artwork = getArtworkValue(candidate, fallback);

    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [candidateIndex, fallback, resolvedCandidates]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates, source, uri]);

  useEffect(() => {
    if (!stablePlaceholder) {
      setStablePlaceholder(fallbackSource);
    }
  }, [fallbackSource, stablePlaceholder]);

  return (
    <Image
      source={resolvedSource}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      placeholder={stablePlaceholder || fallbackSource}
      transition={180}
      onLoad={() => setStablePlaceholder(resolvedSource)}
      onError={() => {
        recordArtworkFailure({
          candidateIndex,
          candidates: resolvedCandidates.length,
        });
        setCandidateIndex((current) =>
          current < resolvedCandidates.length - 1 ? current + 1 : current
        );
      }}
    />
  );
}

export default memo(HTImage);
