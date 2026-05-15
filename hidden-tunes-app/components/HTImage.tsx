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

  const resolvedSource = useMemo(() => {
    if (failed) return { uri: fallback };

    const candidate = source ?? uri;
    const artwork = getArtworkValue(candidate, fallback);

    return typeof artwork === "string" ? { uri: artwork } : artwork;
  }, [failed, fallback, source, uri]);

  useEffect(() => {
    setFailed(false);
  }, [source, uri]);

  return (
    <Image
      source={resolvedSource}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={120}
      onError={() => setFailed(true)}
    />
  );
}

export default memo(HTImage);
