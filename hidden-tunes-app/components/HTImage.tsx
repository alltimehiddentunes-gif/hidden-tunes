import { Image } from "expo-image";
import React, { memo, useEffect, useMemo, useState } from "react";
import { ImageStyle, StyleProp } from "react-native";

import { FALLBACK_ARTWORK, getArtworkValue } from "../utils/artwork";

type Props = {
  uri?: string | null;
  source?: any;
  fallback?: any;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
};

function HTImage({
  uri,
  source,
  fallback = FALLBACK_ARTWORK,
  style,
  contentFit = "cover",
}: Props) {
  const [failed, setFailed] = useState(false);

  const fallbackSource = useMemo(() => {
    const artwork = getArtworkValue(fallback, FALLBACK_ARTWORK);
    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [fallback]);

  const resolvedSource = useMemo(() => {
    if (failed) return fallbackSource;

    const candidate = source ?? uri;
    const artwork = getArtworkValue(candidate, fallback);

    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [failed, fallback, fallbackSource, source, uri]);

  useEffect(() => {
    setFailed(false);
  }, [source, uri]);

  return (
    <Image
      source={resolvedSource}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      placeholder={fallbackSource}
      transition={180}
      onError={() => setFailed(true)}
    />
  );
}

export default memo(HTImage);
