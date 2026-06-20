import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { GRADIENTS } from "../constants/theme";
import HTImage from "./HTImage";
import { FALLBACK_ARTWORK } from "../utils/artwork";

type Props = {
  tracks: any[];
  size?: number;
};

function PlaylistArtworkCollage({ tracks, size = 82 }: Props) {
  const images = useMemo(
    () =>
      (tracks || [])
        .map((track) => track?.cover || track?.thumbnail || track?.artwork)
        .filter(Boolean)
        .slice(0, 4),
    [tracks]
  );

  const frameStyle = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size * 0.24,
    }),
    [size]
  );

  if (images.length === 0) {
    return (
      <LinearGradient
        colors={GRADIENTS.card}
        style={[styles.empty, frameStyle]}
      >
        <HTImage
          source={FALLBACK_ARTWORK}
          style={styles.logoFallback}
          contentFit="cover"
        />
      </LinearGradient>
    );
  }

  if (images.length === 1) {
    return (
      <HTImage
        uri={String(images[0])}
        style={[styles.single, frameStyle]}
        contentFit="cover"
      />
    );
  }

  return (
    <View style={[styles.grid, frameStyle]}>
      {[0, 1, 2, 3].map((index) => {
        const image = images[index] || images[0];

        return (
          <HTImage
            key={`collage-${index}`}
            uri={String(image)}
            style={styles.gridTile}
            contentFit="cover"
          />
        );
      })}
    </View>
  );
}

export default memo(PlaylistArtworkCollage);

const styles = StyleSheet.create({
  single: {
    backgroundColor: "#111",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
    backgroundColor: "#111",
  },

  gridTile: {
    width: "50%",
    height: "50%",
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  logoFallback: {
    width: "100%",
    height: "100%",
  },
});
