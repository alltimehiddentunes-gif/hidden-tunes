import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/theme";
import {
  readTvFavoritesSync,
  subscribeTvFavorites,
  toggleTvChannelFavorite,
} from "@/services/tv/tvFavorites";
import type { TVChannel } from "@/types/tv";
import { formatTvChannelTitle } from "@/utils/formatTvChannelDisplay";

type TvChannelCardProps = {
  channel: TVChannel;
  width?: number;
  onPress: (channel: TVChannel) => void;
  showFavorite?: boolean;
  connecting?: boolean;
  showRemove?: boolean;
  onRemove?: (channel: TVChannel) => void;
  progressRatio?: number | null;
};

function formatCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function TvChannelCard({
  channel,
  width = 148,
  onPress,
  showFavorite = true,
  connecting = false,
  showRemove = false,
  onRemove,
  progressRatio = null,
}: TvChannelCardProps) {
  const displayName = formatTvChannelTitle(channel.name) || channel.name;
  const [favorited, setFavorited] = useState(() =>
    readTvFavoritesSync().some((entry) => entry.channelId === channel.id)
  );
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    setFavorited(
      readTvFavoritesSync().some((entry) => entry.channelId === channel.id)
    );

    return subscribeTvFavorites((entries) => {
      setFavorited(entries.some((entry) => entry.channelId === channel.id));
    });
  }, [channel.id]);

  const handleToggleFavorite = useCallback(async () => {
    if (favoriteBusy) return;

    const previous = favorited;
    setFavorited(!previous);
    setFavoriteBusy(true);

    try {
      const result = await toggleTvChannelFavorite(channel);
      setFavorited(result.favorited);
      if (!result.persisted) {
        setFavorited(previous);
      }
    } catch {
      setFavorited(previous);
    } finally {
      setFavoriteBusy(false);
    }
  }, [channel, favoriteBusy, favorited]);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(channel)}
      disabled={connecting}
      style={[styles.card, { width }, connecting && styles.cardConnecting]}
      accessibilityRole="button"
      accessibilityLabel={`Play ${displayName}`}
    >
      <View style={styles.logoWrap}>
        {channel.logoUrl ? (
          <Image
            source={{ uri: channel.logoUrl }}
            style={styles.logo}
            contentFit="contain"
            transition={0}
            recyclingKey={channel.id}
            cachePolicy="memory-disk"
            priority="low"
          />
        ) : (
          <View style={styles.logoFallback}>
            <Ionicons name="tv" size={28} color={COLORS.primary} />
          </View>
        )}

        {channel.isLive ? (
          <View style={[styles.liveBadge, showRemove && styles.liveBadgeWithRemove]}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}

        {channel.quality ? (
          <View style={styles.qualityBadge}>
            <Text style={styles.qualityText}>{channel.quality}</Text>
          </View>
        ) : null}

        {connecting ? (
          <View style={styles.connectingOverlay}>
            <ActivityIndicator color={COLORS.primary} size="small" />
          </View>
        ) : null}

        {showFavorite ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation?.();
              void handleToggleFavorite();
            }}
            hitSlop={10}
            style={styles.favoriteButton}
            accessibilityRole="button"
            accessibilityLabel={
              favorited
                ? `Remove ${displayName} from favorites`
                : `Add ${displayName} to favorites`
            }
            disabled={favoriteBusy}
          >
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={18}
              color={favorited ? COLORS.primary : "#fff"}
            />
          </Pressable>
        ) : null}

        {showRemove && onRemove ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation?.();
              onRemove(channel);
            }}
            hitSlop={10}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${displayName} from watch history`}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        ) : null}

        {typeof progressRatio === "number" && progressRatio > 0 ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, Math.max(0, progressRatio * 100))}%` },
              ]}
            />
          </View>
        ) : null}
      </View>

      <Text numberOfLines={2} style={styles.title}>
        {displayName}
      </Text>

      <Text numberOfLines={1} style={styles.meta}>
        {formatCategoryLabel(channel.category)}
        {channel.country ? ` ┬À ${channel.country}` : ""}
      </Text>

      {channel.language ? (
        <Text numberOfLines={1} style={styles.language}>
          {channel.language}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default memo(TvChannelCard, (prev, next) => {
  return (
    prev.channel.id === next.channel.id &&
    prev.width === next.width &&
    prev.channel.name === next.channel.name &&
    prev.channel.logoUrl === next.channel.logoUrl &&
    prev.showFavorite === next.showFavorite &&
    prev.connecting === next.connecting &&
    prev.showRemove === next.showRemove &&
    prev.progressRatio === next.progressRatio
  );
});

const styles = StyleSheet.create({
  card: {
    marginRight: 12,
  },

  cardConnecting: {
    opacity: 0.92,
  },

  logoWrap: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    width: "72%",
    height: "72%",
  },

  logoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "rgba(239,68,68,0.92)",
  },

  liveBadgeWithRemove: {
    top: 40,
  },

  liveText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  qualityBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  qualityText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: "800",
  },

  favoriteButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 2,
  },

  removeButton: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 2,
  },

  connectingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 1,
  },

  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
  },

  title: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 9,
    lineHeight: 17,
  },

  meta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  language: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
});
