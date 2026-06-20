import React, { memo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import HTImage from "../HTImage";
import { COLORS } from "../../constants/theme";
import type { HiddenTunesCloudPlaylist } from "../../services/hiddenTunesApi";

type LaunchContentPlaylistRailProps = {
  title: string;
  playlists: HiddenTunesCloudPlaylist[];
  nested?: boolean;
};

export const LaunchContentPlaylistRail = memo(function LaunchContentPlaylistRail({
  title,
  playlists,
  nested = true,
}: LaunchContentPlaylistRailProps) {
  if (!playlists.length) return null;

  const renderItem: ListRenderItem<HiddenTunesCloudPlaylist> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/cloud-playlist/[id]",
          params: { id: String(item.id) },
        } as any)
      }
    >
      <HTImage uri={item.artwork} style={styles.artwork} />
      <Text numberOfLines={2} style={styles.cardTitle}>
        {item.title}
      </Text>
      <Text numberOfLines={2} style={styles.cardSubtitle}>
        {item.description}
      </Text>
      <View style={styles.metaRow}>
        <Ionicons name="musical-notes-outline" size={12} color={COLORS.primary} />
        <Text style={styles.metaText}>{item.tracks.length} songs</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        horizontal
        nestedScrollEnabled={nested}
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        renderItem={renderItem}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 20,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  rail: {
    paddingLeft: 20,
    paddingRight: 28,
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    width: 168,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardPressed: {
    opacity: 0.88,
  },
  artwork: {
    width: "100%",
    height: 128,
    borderRadius: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    minHeight: 32,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
});
