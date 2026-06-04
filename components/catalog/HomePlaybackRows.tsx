import { memo, useCallback } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../constants/theme";
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
      <HTImage source={item} style={styles.featuredCover} />

      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.72)"]}
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

        <Text numberOfLines={1} style={styles.featuredTitle}>
          {item.title}
        </Text>

        <Text numberOfLines={1} style={styles.featuredArtist}>
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
    height: 272,
    borderRadius: 32,
    marginRight: 16,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  featuredCardActive: {
    borderColor: "rgba(168,85,247,0.65)",
  },
  featuredCover: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  featuredOverlay: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
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
    fontSize: 21,
    fontWeight: "900",
  },
  featuredArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
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
