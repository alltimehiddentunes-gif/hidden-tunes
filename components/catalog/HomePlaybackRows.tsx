import { memo, useCallback, useEffect } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  COLORS,
  GRADIENTS,
  LUXURY_GLOW,
  SHADOWS,
  TYPOGRAPHY,
} from "../../constants/theme";
import { useTrackPlaybackStatus } from "../../context/playerContextSlices";
import type { HiddenTunesNormalizedSong } from "../../services/hiddenTunesApi";
import HTImage from "../HTImage";
import NeonEQ from "../NeonEQ";
import CatalogSongRow from "./CatalogSongRow";

type HomeCatalogSongRowProps = {
  song: HiddenTunesNormalizedSong;
  image?: any;
  onPress: (song: HiddenTunesNormalizedSong) => void;
};

export const HomeCatalogSongRow = memo(function HomeCatalogSongRow({
  song,
  image,
  onPress,
}: HomeCatalogSongRowProps) {
  const { isActive, isPlaying } = useTrackPlaybackStatus(String(song.id));

  return (
    <View style={[styles.mediaShell, isActive && styles.mediaShellActive]}>
      <CatalogSongRow
        song={song}
        image={image || song}
        active={isActive}
        isPlaying={isPlaying}
        onPress={onPress}
      />
    </View>
  );
});

const FeaturedCardGlow = memo(function FeaturedCardGlow({
  active,
}: {
  active: boolean;
}) {
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const scale = useSharedValue<number>(LUXURY_GLOW.scaleMin);

  useEffect(() => {
    const peak = active ? LUXURY_GLOW.opacityMax + 0.08 : LUXURY_GLOW.opacityMax;
    const floor = LUXURY_GLOW.opacityMin;

    opacity.value = withRepeat(
      withSequence(
        withTiming(peak, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(floor, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.scaleMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.scaleMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [active, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.featuredGlow, animatedStyle]}>
      <LinearGradient colors={GRADIENTS.heroAura} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
});

type HomeFeaturedCardProps = {
  item: HiddenTunesNormalizedSong;
  index: number;
  onPress: (song: HiddenTunesNormalizedSong) => void;
};

export const HomeFeaturedCard = memo(function HomeFeaturedCard({
  item,
  index,
  onPress,
}: HomeFeaturedCardProps) {
  const { isActive, isPlaying } = useTrackPlaybackStatus(String(item.id));

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.featuredCard, isActive && styles.featuredCardActive]}
      onPress={handlePress}
    >
      <FeaturedCardGlow active={isActive} />

      <View style={styles.featuredArtFrame}>
        <HTImage source={item} style={styles.featuredCover} contentFit="cover" />
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.68)"]}
        style={styles.featuredOverlay}
      />

      <View style={styles.featuredRank}>
        <Text style={styles.featuredRankText}>
          {String(index + 1).padStart(2, "0")}
        </Text>
      </View>

      <View style={styles.featuredContent}>
        <View style={styles.featuredBadge}>
          {isActive ? (
            <NeonEQ isPlaying={isPlaying} size="small" />
          ) : (
            <Ionicons name="sparkles" size={13} color={COLORS.primary} />
          )}

          <Text style={styles.featuredBadgeText}>
            {isActive ? "NOW PLAYING" : "HIDDEN TUNES"}
          </Text>
        </View>

        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.featuredTitle}>
          {item.title}
        </Text>

        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.featuredArtist}>
          {item.artist}
        </Text>

        <View style={styles.featuredBottom}>
          <View style={styles.autoNextPill}>
            <Ionicons name="play-skip-forward" size={13} color={COLORS.text} />
            <Text style={styles.autoNextText}>Playing next</Text>
          </View>

          <View style={styles.featuredPlay}>
            <Ionicons
              name={isActive && isPlaying ? "pause" : "play"}
              size={18}
              color="#000"
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const { width } = Dimensions.get("window");
const FEATURED_CARD_WIDTH = width * 0.72;

const styles = StyleSheet.create({
  mediaShell: {
    position: "relative",
  },
  mediaShellActive: {
    borderRadius: 28,
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: 280,
    borderRadius: 32,
    marginRight: 16,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    ...SHADOWS.premium,
  },
  featuredCardActive: {
    borderColor: "rgba(168,85,247,0.72)",
  },
  featuredGlow: {
    position: "absolute",
    top: -18,
    left: -12,
    right: -12,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    zIndex: 0,
  },
  featuredArtFrame: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    margin: 12,
    marginBottom: 108,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    zIndex: 1,
  },
  featuredCover: {
    width: "100%",
    height: "100%",
  },
  featuredOverlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 2,
  },
  featuredRank: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.58)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    zIndex: 3,
  },
  featuredRankText: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },
  featuredContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
    zIndex: 3,
  },
  featuredBadge: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  featuredBadgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  featuredTitle: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: "900",
    lineHeight: TYPOGRAPHY.sectionTitle + 4,
  },
  featuredArtist: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.metadata,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: TYPOGRAPHY.metadata + 3,
  },
  featuredBottom: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  autoNextPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
  },
  autoNextText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 6,
  },
  featuredPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
