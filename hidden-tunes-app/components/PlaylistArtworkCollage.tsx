import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../constants/theme";

type Props = {
  tracks: any[];
  size?: number;
};

export default function PlaylistArtworkCollage({ tracks, size = 82 }: Props) {
  const images = (tracks || [])
    .map((track) => track?.cover || track?.thumbnail || track?.artwork)
    .filter(Boolean)
    .slice(0, 4);

  if (images.length === 0) {
    return (
      <LinearGradient
        colors={GRADIENTS.card}
        style={[
          styles.empty,
          {
            width: size,
            height: size,
            borderRadius: size * 0.24,
          },
        ]}
      >
        <Ionicons name="musical-notes" size={size * 0.42} color={COLORS.textMuted} />
      </LinearGradient>
    );
  }

  if (images.length === 1) {
    return (
      <Image
        source={typeof images[0] === "string" ? { uri: images[0] } : images[0]}
        style={[
          styles.single,
          {
            width: size,
            height: size,
            borderRadius: size * 0.24,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.grid,
        {
          width: size,
          height: size,
          borderRadius: size * 0.24,
        },
      ]}
    >
      {[0, 1, 2, 3].map((index) => {
        const image = images[index] || images[0];

        return (
          <Image
            key={index}
            source={typeof image === "string" ? { uri: image } : image}
            style={{
              width: size / 2,
              height: size / 2,
            }}
          />
        );
      })}
    </View>
  );
}

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

  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
});