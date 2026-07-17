/**
 * Isolated Sports pilot screen — Phase 2A.
 * Not added to bottom tabs. Reachable via /sports while feature flag is on.
 * Does not touch PlayerContext, MiniPlayer, TV, or music queue.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { isSportsClientEnabled } from "../constants/sportsFlags";
import {
  SportsPlaybackProvider,
  useSportsPlayback,
} from "../context/SportsPlaybackContext";
import {
  fetchSportsHome,
  fetchSportsVideos,
  resolveSportsVideoPlayback,
} from "../services/sports/sportsApiClient";
import { recordSportsWatchHistory } from "../services/sports/sportsWatchHistory";
import type { SportsBrowseItem, SportsPlaybackResult } from "../types/sports";

type ListItem = SportsBrowseItem & { section?: string };

function SportsPilotInner() {
  const enabled = isSportsClientEnabled("sports_enabled");
  const sportsPlayback = useSportsPlayback();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [embedPlayback, setEmbedPlayback] = useState<SportsPlaybackResult | null>(
    null
  );
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resolveInflight = useRef(false);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    if (!enabled) {
      setItems([]);
      setLoading(false);
      setError("Sports is disabled by feature flag.");
      return;
    }

    try {
      const [home, videos] = await Promise.all([
        fetchSportsHome({
          signal: controller.signal,
          country: "ZZ",
          platform: "ios",
        }),
        fetchSportsVideos({
          signal: controller.signal,
          page: 1,
          limit: 20,
          country: "ZZ",
          platform: "ios",
        }),
      ]);

      if (controller.signal.aborted) return;

      const next: ListItem[] = [];
      const sections = home.sections || {};
      for (const [section, rows] of Object.entries(sections)) {
        for (const row of rows || []) {
          next.push({ ...row, section });
        }
      }
      for (const raw of videos.items || []) {
        next.push({
          id: String(raw.id || ""),
          title: String(raw.title || raw.name || "Untitled"),
          status: String(raw.status || "discovered"),
          artworkUrl: (raw.artwork_url as string) || null,
          watchAction: "none",
          watchLabel: "Tap to resolve",
          section: "videos",
        });
      }

      // Dedupe by id, bound list.
      const seen = new Set<string>();
      setItems(
        next.filter((item) => {
          if (!item.id || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }).slice(0, 40)
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
      sportsPlayback.stop();
      setEmbedPlayback(null);
    };
  }, [load, sportsPlayback]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const onPressItem = useCallback(
    async (item: ListItem) => {
      if (!enabled || resolveInflight.current) return;
      resolveInflight.current = true;
      setError(null);
      setEmbedPlayback(null);
      setActiveTitle(item.title);

      const controller = new AbortController();
      try {
        // Videos use video play resolver; broadcasts use broadcast resolver via context.
        if (item.section === "videos") {
          const result = await resolveSportsVideoPlayback({
            videoId: item.id,
            platform: "ios",
            country: "ZZ",
            signal: controller.signal,
          });
          if (!result.success || !result.playback) {
            setError(result.error || result.code || "Unable to resolve playback.");
            return;
          }
          if (result.playback.mode === "external") {
            const url =
              result.playback.deepLink || result.playback.fallbackUrl || "";
            if (url) await Linking.openURL(url);
            await recordSportsWatchHistory({
              id: item.id,
              kind: "video",
              title: item.title,
              positionMs: 0,
            });
            return;
          }
          if (result.playback.mode === "embedded") {
            setEmbedPlayback(result.playback);
            await recordSportsWatchHistory({
              id: item.id,
              kind: "video",
              title: item.title,
              positionMs: 0,
            });
            return;
          }
          setError("Native Sports playback is not enabled for this provider.");
          return;
        }

        const ok = await sportsPlayback.startBroadcast({
          broadcastId: item.id,
          title: item.title,
          platform: "ios",
          country: "ZZ",
        });
        if (!ok) {
          setError(sportsPlayback.error || "Unable to start Sports playback.");
        } else if (sportsPlayback.session?.playback.mode === "embedded") {
          setEmbedPlayback(sportsPlayback.session.playback);
        } else if (sportsPlayback.session?.playback.mode === "external") {
          const p = sportsPlayback.session.playback;
          const url = p.deepLink || p.fallbackUrl || "";
          if (url) await Linking.openURL(url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        resolveInflight.current = false;
      }
    },
    [enabled, sportsPlayback]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Sports Pilot</Text>
        <Text style={styles.flag}>{enabled ? "flag on" : "flag off"}</Text>
      </View>

      {embedPlayback?.mode === "embedded" ? (
        <View style={styles.embedBox}>
          <Text style={styles.embedTitle} numberOfLines={2}>
            {activeTitle || "Official embed"}
          </Text>
          <WebView
            source={{ uri: embedPlayback.embedUrl }}
            style={styles.webview}
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction
            onError={() => setError("Embedded player failed to load.")}
          />
          <Pressable
            onPress={() => {
              setEmbedPlayback(null);
              sportsPlayback.stop();
            }}
            style={styles.closeEmbed}
          >
            <Text style={styles.closeEmbedText}>Close player</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.muted}>Loading Sports…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              <Text style={styles.hint}>
                Metadata only until tap. No autoplay. Olympics = official embed /
                external YouTube.
              </Text>
            )
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>
                {enabled
                  ? "No Sports pilot inventory yet."
                  : "Enable EXPO_PUBLIC_SPORTS_ENABLED to load Sports."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const playableHint =
              item.watchAction && item.watchAction !== "none"
                ? item.watchLabel || item.watchAction
                : "Resolve on tap";
            return (
              <Pressable style={styles.row} onPress={() => void onPressItem(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.section || "item"} · {item.status} · {playableHint}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </SafeAreaView>
  );
}

export default function SportsPilotScreen() {
  return (
    <SportsPlaybackProvider>
      <SportsPilotInner />
    </SportsPlaybackProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: { color: "#8ab4ff", fontSize: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", flex: 1 },
  flag: { color: "#888", fontSize: 12 },
  center: { padding: 24, alignItems: "center", gap: 8 },
  muted: { color: "#999", textAlign: "center" },
  hint: { color: "#777", paddingHorizontal: 16, paddingBottom: 8, fontSize: 12 },
  error: { color: "#f88", paddingHorizontal: 16, paddingBottom: 8 },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  rowTitle: { color: "#fff", fontSize: 15 },
  rowMeta: { color: "#888", fontSize: 12, marginTop: 4 },
  embedBox: { height: 280, borderBottomWidth: 1, borderBottomColor: "#222" },
  embedTitle: { color: "#fff", padding: 8, fontSize: 13 },
  webview: { flex: 1, backgroundColor: "#111" },
  closeEmbed: { padding: 10, alignItems: "center" },
  closeEmbedText: { color: "#8ab4ff" },
});
