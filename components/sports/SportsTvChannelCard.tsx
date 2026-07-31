/**
 * Compact Sports TV catalog card — metadata from canonical TV catalog only.
 * Playback is owned exclusively by the existing TV session / TvPlayerHost.
 */
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { formatTvChannelTitle } from "@/utils/formatTvChannelDisplay";
import {
  getTvChannelInitials,
  getTvDisplaySubtitle,
  markTvArtworkLoadFailure,
  resolveTvArtworkUrl,
} from "@/utils/tvArtwork";

export type SportsTvChannelCardProps = {
  video: HiddenTunesTvVideo;
  connecting?: boolean;
  onPress: (video: HiddenTunesTvVideo) => void;
  style?: StyleProp<ViewStyle>;
};

function SportsTvChannelCard({
  video,
  connecting = false,
  onPress,
  style,
}: SportsTvChannelCardProps) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const artworkUrl = useMemo(() => resolveTvArtworkUrl(video), [video]);
  const displayName = useMemo(
    () => formatTvChannelTitle(video.title) || video.title || "Sports channel",
    [video.title]
  );
  const subtitle = useMemo(() => getTvDisplaySubtitle(video), [video]);
  const initials = useMemo(() => getTvChannelInitials(displayName), [displayName]);
  const showArtwork = Boolean(artworkUrl) && !artworkFailed;
  const playable =
    video.playable === true &&
    video.playback_status === "playable" &&
    !video.quarantined_at &&
    !video.disabled;

  const handlePress = useCallback(() => {
    if (connecting || !playable) return;
    onPress(video);
  }, [connecting, onPress, playable, video]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={connecting || !playable}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={`Play ${displayName} on Live Sports TV`}
    >
      <View style={styles.logoWrap}>
        {showArtwork && artworkUrl ? (
          <Image
            source={{ uri: artworkUrl, width: 96, height: 96 }}
            style={styles.logo}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={video.id}
            priority="low"
            transition={0}
            onError={() => {
              markTvArtworkLoadFailure(artworkUrl);
              setArtworkFailed(true);
            }}
          />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}
        {connecting ? (
          <View style={styles.connectingOverlay}>
            <ActivityIndicator color={SPORTS_COLORS.amber} size="small" />
          </View>
        ) : playable ? (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={12} color="#0A0A0A" />
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {displayName}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {[subtitle || "Sports", video.country || null].filter(Boolean).join(" · ")}
      </Text>
      {playable ? (
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function areEqual(prev: SportsTvChannelCardProps, next: SportsTvChannelCardProps) {
  return (
    prev.video.id === next.video.id &&
    prev.video.title === next.video.title &&
    prev.video.logo === next.video.logo &&
    prev.video.playable === next.video.playable &&
    prev.video.playback_status === next.video.playback_status &&
    prev.connecting === next.connecting
  );
}

export default memo(SportsTvChannelCard, areEqual);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: SPORTS_COLORS.surface,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    padding: 10,
  },
  logoWrap: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "72%",
    height: "72%",
  },
  logoFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  initials: {
    color: SPORTS_COLORS.amber,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1,
  },
  playBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: SPORTS_COLORS.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  title: {
    color: SPORTS_COLORS.text,
    fontSize: 12.5,
    fontWeight: "800",
    marginTop: 8,
    lineHeight: 16,
  },
  meta: {
    color: SPORTS_COLORS.textDim,
    fontSize: 10.5,
    fontWeight: "600",
    marginTop: 3,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SPORTS_COLORS.live,
  },
  liveText: {
    color: SPORTS_COLORS.live,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
