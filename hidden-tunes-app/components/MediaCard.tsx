import React, { memo, useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../constants/theme";
import HTImage from "./HTImage";
import { FALLBACK_ARTWORK } from "../utils/artwork";

type MediaCardProps = {
  title: string;
  subtitle?: string;
  image?: any;
  type?: "song" | "playlist" | "album" | "artist" | "radio";
  size?: "small" | "medium" | "large";
  showPlayButton?: boolean;
  onPress?: () => void;
  onPlayPress?: () => void;
};

function MediaCard({
  title,
  subtitle,
  image,
  type = "song",
  size = "medium",
  showPlayButton = true,
  onPress,
  onPlayPress,
}: MediaCardProps) {
  const artworkSize = useMemo(() => {
    if (size === "large") return 150;
    if (size === "small") return 58;
    return 82;
  }, [size]);

  const artworkRadius = useMemo(() => artworkSize * 0.24, [artworkSize]);

  const imageSource = useMemo(() => {
    if (!image) return null;
    return typeof image === "string" ? image : image;
  }, [image]);

  const artworkStyle = useMemo(
    () => [
      styles.artwork,
      {
        width: artworkSize,
        height: artworkSize,
        borderRadius: artworkRadius,
      },
    ],
    [artworkSize, artworkRadius]
  );

  const emptyArtworkStyle = useMemo(
    () => [
      styles.emptyArtwork,
      {
        width: artworkSize,
        height: artworkSize,
        borderRadius: artworkRadius,
      },
    ],
    [artworkSize, artworkRadius]
  );

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.wrapper, size === "large" && styles.largeWrapper]}
    >
      <LinearGradient
        colors={GRADIENTS.card}
        style={[styles.card, size === "large" && styles.largeCard]}
      >
        {imageSource ? (
          <HTImage
            source={imageSource}
            style={artworkStyle}
            contentFit="cover"
          />
        ) : (
          <HTImage
            source={FALLBACK_ARTWORK}
            style={emptyArtworkStyle}
            contentFit="cover"
          />
        )}

        <View style={[styles.info, size === "large" && styles.largeInfo]}>
          <Text
            numberOfLines={size === "large" ? 2 : 1}
            style={[styles.title, size === "large" && styles.largeTitle]}
          >
            {title}
          </Text>

          {!!subtitle && (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          )}
        </View>

        {showPlayButton && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPlayPress || onPress}
            style={styles.playButton}
          >
            <Ionicons name="play" size={18} color="#050505" />
          </TouchableOpacity>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default memo(MediaCard);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },

  largeWrapper: {
    width: 180,
    marginRight: 16,
    marginBottom: 0,
  },

  card: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    shadowColor: "#A855F7",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 2,
  },

  largeCard: {
    width: 180,
    minHeight: 238,
    alignItems: "flex-start",
    flexDirection: "column",
    padding: 14,
  },

  artwork: {
    backgroundColor: "#111",
  },

  emptyArtwork: {
    alignItems: "center",
    justifyContent: "center",
  },

  info: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 6,
  },

  largeInfo: {
    marginLeft: 0,
    marginTop: 12,
    width: "100%",
    paddingRight: 0,
  },

  title: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -0.2,
  },

  largeTitle: {
    fontSize: 16,
    lineHeight: 21,
  },

  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
  },

  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    marginLeft: 10,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 3,
  },
});
