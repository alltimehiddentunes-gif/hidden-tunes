import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import AppShell from "../components/navigation/AppShell";
import HTImage from "../components/HTImage";
import { COLORS, GRADIENTS } from "../constants/theme";
import PremiumEmptyState from "../components/PremiumEmptyState";
import {
  clearDownloads,
  deleteDownload,
  getDownloadedSongs,
  type DownloadedSong,
} from "../services/downloads";

function formatDate(value?: string) {
  if (!value) return "Saved offline";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Saved offline";

    return `Saved ${date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  } catch {
    return "Saved offline";
  }
}

export default function DownloadsScreen() {
  const [downloads, setDownloads] = useState<DownloadedSong[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const downloadCountLabel = useMemo(() => {
    return `${downloads.length} saved track${downloads.length === 1 ? "" : "s"}`;
  }, [downloads.length]);

  const loadDownloads = useCallback(async () => {
    setDownloads(await getDownloadedSongs());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDownloads();
    }, [loadDownloads])
  );

  const refreshDownloads = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadDownloads();
    } finally {
      setRefreshing(false);
    }
  }, [loadDownloads]);

  const handleDeleteDownload = useCallback((song: DownloadedSong) => {
    Alert.alert(
      "Remove download?",
      `${song.title} will be removed from offline storage.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deleteDownload(song.id);
            await loadDownloads();
          },
        },
      ]
    );
  }, [loadDownloads]);

  const handleClearDownloads = useCallback(() => {
    if (downloads.length === 0) return;

    Alert.alert(
      "Clear downloads?",
      "All saved offline tracks will be removed from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearDownloads();
            await loadDownloads();
          },
        },
      ]
    );
  }, [downloads.length, loadDownloads]);

  const renderDownload = useCallback(
    ({ item }: { item: DownloadedSong }) => (
      <View style={styles.songCard}>
        <HTImage source={item} uri={item.cover} style={styles.cover} contentFit="cover" />

        <View style={styles.songInfo}>
          <Text numberOfLines={1} style={styles.songTitle}>
            {item.title}
          </Text>

          <Text numberOfLines={1} style={styles.artist}>
            {item.artist}
          </Text>

          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-done" size={12} color={COLORS.cyan} />
            <Text style={styles.offlineText}>{formatDate(item.downloadedAt)}</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.82}
          accessibilityLabel={`Remove ${item.title} download`}
          style={styles.removeButton}
          onPress={() => handleDeleteDownload(item)}
        >
          <Ionicons name="trash-outline" size={19} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    ),
    [handleDeleteDownload]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View pointerEvents="none" style={styles.glowPurple} />
        <View pointerEvents="none" style={styles.glowCyan} />

        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Downloads</Text>
            <Text style={styles.headerSubtitle}>{downloadCountLabel}</Text>
          </View>

          {downloads.length > 0 ? (
            <TouchableOpacity style={styles.iconButton} onPress={handleClearDownloads}>
              <Ionicons name="trash-outline" size={21} color={COLORS.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconButtonPlaceholder} />
          )}
        </View>

        <FlatList
          data={downloads}
          keyExtractor={(item) => item.id}
          renderItem={renderDownload}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshDownloads}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <LinearGradient colors={GRADIENTS.neon} style={styles.summaryBorder}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryIcon}>
                  <Ionicons name="download-outline" size={26} color={COLORS.primaryGlow} />
                </View>

                <View style={styles.summaryCopy}>
                  <Text style={styles.summaryLabel}>Offline Library</Text>
                  <Text style={styles.summaryValue}>{downloadCountLabel}</Text>
                  <Text style={styles.summaryText}>
                    Only tracks saved by the app appear here.
                  </Text>
                </View>
              </View>
            </LinearGradient>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <PremiumEmptyState
                icon="download-outline"
                title="Offline music will live here"
                message="When downloads are available on this device, they will appear with artwork, dates, and quick cleanup controls."
                actionLabel="Browse Music"
                onAction={() => router.push("/music-feed" as any)}
              />
            </View>
          }
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
  },
  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    alignItems: "center",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconButtonPlaceholder: {
    width: 42,
    height: 42,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  summaryBorder: {
    borderRadius: 30,
    padding: 2,
    marginBottom: 24,
  },
  summaryCard: {
    minHeight: 118,
    borderRadius: 28,
    padding: 18,
    backgroundColor: "rgba(18,7,31,0.95)",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.14)",
  },
  summaryCopy: {
    flex: 1,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 5,
  },
  summaryText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 5,
  },
  songCard: {
    marginBottom: 14,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  coverPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    marginLeft: 14,
  },
  songTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  artist: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  offlineText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },
  removeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 46,
    paddingHorizontal: 22,
  },
  emptyIcon: {
    width: 118,
    height: 118,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 18,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    fontWeight: "700",
  },
  browseButton: {
    height: 48,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 22,
  },
  browseButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
  },
});
