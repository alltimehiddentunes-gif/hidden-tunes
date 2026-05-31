import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/theme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";

type TvVideoCardProps = {
  video: HiddenTunesTvVideo;
  width?: number;
  onPress: (video: HiddenTunesTvVideo) => void;
};

function TvVideoCard({ video, width = 168, onPress }: TvVideoCardProps) {
  const thumbnail =
    video.thumbnail_url ||
    `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(video)}
      style={[styles.card, { width }]}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumb}
          contentFit="cover"
          transition={120}
          recyclingKey={video.id}
        />
        <View style={styles.playBadge}>
          <Ionicons name="play" size={14} color="#000" />
        </View>
      </View>

      <Text numberOfLines={2} style={styles.title}>
        {video.title}
      </Text>

      <Text numberOfLines={1} style={styles.channel}>
        {video.channel_name || "Hidden Tunes TV"}
      </Text>

      {video.genre ? (
        <Text numberOfLines={1} style={styles.meta}>
          {video.genre}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default memo(TvVideoCard);

const styles = StyleSheet.create({
  card: {
    marginRight: 12,
  },

  thumbWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  thumb: {
    width: "100%",
    height: "100%",
  },

  playBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
    lineHeight: 17,
  },

  channel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  meta: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
});
