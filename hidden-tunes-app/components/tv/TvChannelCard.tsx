import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/theme";
import type { TVChannel } from "@/types/tv";

type TvChannelCardProps = {
  channel: TVChannel;
  width?: number;
  onPress: (channel: TVChannel) => void;
};

function formatCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function TvChannelCard({ channel, width = 148, onPress }: TvChannelCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(channel)}
      style={[styles.card, { width }]}
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
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}

        {channel.quality ? (
          <View style={styles.qualityBadge}>
            <Text style={styles.qualityText}>{channel.quality}</Text>
          </View>
        ) : null}
      </View>

      <Text numberOfLines={2} style={styles.title}>
        {channel.name}
      </Text>

      <Text numberOfLines={1} style={styles.meta}>
        {formatCategoryLabel(channel.category)}
        {channel.country ? ` · ${channel.country}` : ""}
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
    prev.channel.logoUrl === next.channel.logoUrl
  );
});

const styles = StyleSheet.create({
  card: {
    marginRight: 12,
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
