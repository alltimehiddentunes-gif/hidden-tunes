import { Image } from "expo-image";
import React, { memo } from "react";
import { ImageStyle, StyleProp } from "react-native";

type Props = {
  uri?: string | null;
  fallback?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
};

const DEFAULT_FALLBACK =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

function HTImage({
  uri,
  fallback = DEFAULT_FALLBACK,
  style,
  contentFit = "cover",
}: Props) {
  const source = uri && String(uri).trim() ? uri : fallback;

  return (
    <Image
      source={{ uri: source }}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={120}
    />
  );
}

export default memo(HTImage);