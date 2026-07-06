import { memo, useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/theme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";

type TvVideoCardProps = {
  video: HiddenTunesTvVideo;
  width?: number;
  loading?: boolean;
  disabled?: boolean;
  onPress: (video: HiddenTunesTvVideo) => void;
};

function TvVideoCard({
  video,
  width = 168,
  loading = false,
  disabled = false,
  onPress,
}: TvVideoCardProps) {
  const handlePress = useCallback(() => {
    onPress(video);
  }, [onPress, video]);

  const thumbnail =
    video.logo ||
    video.thumbnail_url ||
    (video.source_id
      ? `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`
      : undefined);

  const subtitle =
    video.categories?.[0] ||
    video.genre ||
    video.country ||
    null;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={disabled}
      onPress={handlePress}
      style={[styles.card, { width }, disabled && styles.cardDisabled]}
    >
      <View style={styles.thumbWrap}>
        {thumbnail ? (
          <Image
            source={{ uri: thumbnail }}
            style={styles.thumb}
            contentFit="cover"
            transition={120}
            recyclingKey={video.id}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]} />
        )}
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={14} color="#000" />
          </View>
        )}
      </View>

      <Text numberOfLines={2} style={styles.title}>
        {video.title}
      </Text>

      <Text numberOfLines={1} style={styles.channel}>
        {video.channel_name || video.country || "Hidden Tunes TV"}
      </Text>

      {subtitle ? (
        <Text numberOfLines={1} style={styles.meta}>
          {subtitle}
          {video.country ? ` - ${video.country}` : ""}
          {video.language ? ` - ${video.language}` : ""}
        </Text>
      ) : null}

      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
    </TouchableOpacity>
  );
}

export default memo(TvVideoCard);

const styles = StyleSheet.create({
  card: {
    marginRight: 12,
  },

  cardDisabled: {
    opacity: 0.72,
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

  thumbFallback: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
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

  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ef4444",
  },

  liveText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: "900",
  },
});
