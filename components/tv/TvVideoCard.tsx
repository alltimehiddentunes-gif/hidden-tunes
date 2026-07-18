import { memo, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/theme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { normalizeVideoItem } from "@/services/videos/videoNormalizer";
import { formatTvChannelTitle } from "@/utils/formatTvChannelDisplay";
import {
  getTvChannelInitials,
  getTvDisplayChannelName,
  getTvDisplaySubtitle,
  markTvArtworkLoadFailure,
  resolveTvArtworkUrl,
  shouldShowTvVerifiedBadge,
} from "@/utils/tvArtwork";

type TvVideoCardProps = {
  video: HiddenTunesTvVideo;
  width?: number | "100%";
  fillWidth?: boolean;
  onPress: (video: HiddenTunesTvVideo) => void;
};

function TvVideoCard({ video, width = 168, fillWidth = false, onPress }: TvVideoCardProps) {
  const item = useMemo(() => normalizeVideoItem(video), [video]);
  const artworkUrl = useMemo(() => resolveTvArtworkUrl(video), [video]);
  const [artworkFailed, setArtworkFailed] = useState(false);
  const channelName = useMemo(() => getTvDisplayChannelName(video), [video]);
  const subtitle = useMemo(() => getTvDisplaySubtitle(video), [video]);
  const showVerified = useMemo(() => shouldShowTvVerifiedBadge(video), [video]);
  const displayName = useMemo(
    () => formatTvChannelTitle(item.title) || item.title,
    [item.title]
  );
  const initials = useMemo(() => getTvChannelInitials(displayName), [displayName]);
  const showArtwork = Boolean(artworkUrl) && !artworkFailed;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(video)}
      style={[styles.card, fillWidth ? styles.cardFill : { width }]}
    >
      <View style={styles.thumbWrap}>
        {showArtwork ? (
          <Image
            source={{ uri: artworkUrl }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => {
              markTvArtworkLoadFailure(artworkUrl);
              setArtworkFailed(true);
            }}
          />
        ) : (
          <LinearGradient colors={["#1a1030", "#0d1828"]} style={styles.thumb}>
            <Text style={styles.initials}>{initials}</Text>
          </LinearGradient>
        )}

        {showVerified ? (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={12} color={COLORS.cyan} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        ) : null}

        <View style={styles.playBadge}>
          <Ionicons name="play" size={14} color="#000" />
        </View>
      </View>

      <Text numberOfLines={2} style={styles.title}>
        {displayName}
      </Text>

      {channelName ? (
        <Text numberOfLines={1} style={styles.channel}>
          {channelName}
        </Text>
      ) : null}

      {subtitle ? (
        <Text numberOfLines={1} style={styles.meta}>
          {subtitle}
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
  cardFill: {
    width: "100%",
    marginRight: 0,
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
    alignItems: "center",
    justifyContent: "center",
  },

  initials: {
    color: COLORS.primaryGlow,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
  },

  verifiedBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.24)",
  },

  verifiedText: {
    color: COLORS.cyan,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
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
