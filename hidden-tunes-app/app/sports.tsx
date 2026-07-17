/**
 * Isolated Sports pilot screen — Phase 2C personalized home IA.
 * Not added to bottom tabs. Reachable via /sports while feature flags allow.
 * Does not touch PlayerContext, MiniPlayer, TV, or music queue.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
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
  resolveSportsVideoPlayback,
} from "../services/sports/sportsApiClient";
import { recordSportsWatchHistory } from "../services/sports/sportsWatchHistory";
import type {
  SportsHomeSection,
  SportsMatchCard,
  SportsPlaybackResult,
} from "../types/sports";

const MAX_ITEMS_PER_SHELF = 12;

/** Development-only local ranking demo — never shown in production builds. */
type DevTestProfile = "anonymous" | "football" | "basketball";

type ShelfRow = {
  key: string;
  sectionId: string;
  sectionTitle: string;
  itemId: string;
  title: string;
  meta: string;
  kind: "match" | "video" | "other";
  playableHint: string;
  reason?: string | null;
};

function applyDevProfileOrder(
  sections: SportsHomeSection[],
  profile: DevTestProfile
): SportsHomeSection[] {
  if (!__DEV__ || profile === "anonymous") return sections;
  const prefer = profile === "football" ? "football" : "basketball";
  return sections.map((section) => {
    if (section.type !== "fixtures" && section.type !== "live") return section;
    if (section.id === "continue_watching" || section.id === "trending") {
      return section;
    }
    const items = [...section.items].sort((a, b) => {
      const ca = a as SportsMatchCard;
      const cb = b as SportsMatchCard;
      const sa = ca.sport?.slug === prefer ? 0 : 1;
      const sb = cb.sport?.slug === prefer ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return String(ca.id).localeCompare(String(cb.id));
    });
    return { ...section, items };
  });
}

function isHomeSectionArray(
  sections: SportsHomeSection[] | Partial<Record<string, unknown[]>> | undefined
): sections is SportsHomeSection[] {
  return Array.isArray(sections);
}

function matchTitle(card: SportsMatchCard): string {
  const names = (card.participants || []).map((p) => p.name).filter(Boolean);
  if (names.length >= 2) return `${names[0]} vs ${names[1]}`;
  if (card.competition?.name) return card.competition.name;
  return card.id;
}

function flattenSections(sections: SportsHomeSection[]): ShelfRow[] {
  const rows: ShelfRow[] = [];
  const ordered = [...sections].sort((a, b) => a.rank - b.rank);
  for (const section of ordered) {
    if (!section.items?.length) continue;
    const bounded = section.items.slice(0, MAX_ITEMS_PER_SHELF);
    for (const raw of bounded) {
      const item = raw as Record<string, unknown>;
      const id = String(item.id || item.code || "");
      if (!id) continue;

      if (section.type === "fixtures" || section.type === "live") {
        const card = item as unknown as SportsMatchCard;
        rows.push({
          key: `${section.id}:${id}`,
          sectionId: section.id,
          sectionTitle: section.title,
          itemId: id,
          title: matchTitle(card),
          meta: [
            card.status?.label || card.status?.code || "",
            card.watchability?.state || "",
            card.timing?.startsAt
              ? new Date(card.timing.startsAt).toLocaleString()
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          kind: "match",
          playableHint: card.watchability?.playable
            ? "Playable"
            : card.watchability?.state || "Browse",
          reason: card.recommendationReason?.label || null,
        });
        continue;
      }

      if (section.type === "videos") {
        rows.push({
          key: `${section.id}:${id}`,
          sectionId: section.id,
          sectionTitle: section.title,
          itemId: id,
          title: String(item.title || "Video"),
          meta: String(item.videoType || item.status || "video"),
          kind: "video",
          playableHint: "Resolve on tap",
        });
        continue;
      }

      rows.push({
        key: `${section.id}:${id}`,
        sectionId: section.id,
        sectionTitle: section.title,
        itemId: id,
        title: String(item.name || item.title || item.code || id),
        meta: String(item.slug || item.region || section.type),
        kind: "other",
        playableHint: "Browse",
      });
    }
  }
  return rows;
}

function SportsPilotInner() {
  const enabled = isSportsClientEnabled("sports_enabled");
  const pilotEnabled = isSportsClientEnabled("sports_mobile_pilot_enabled");
  const sportsPlayback = useSportsPlayback();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SportsHomeSection[]>([]);
  const [devProfile, setDevProfile] = useState<DevTestProfile>("anonymous");
  const [embedPlayback, setEmbedPlayback] = useState<SportsPlaybackResult | null>(
    null
  );
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resolveInflight = useRef(false);

  const displaySections = useMemo(
    () => applyDevProfileOrder(sections, devProfile),
    [sections, devProfile]
  );
  const rows = useMemo(
    () => flattenSections(displaySections),
    [displaySections]
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    if (!enabled || !pilotEnabled) {
      setSections([]);
      setLoading(false);
      setError(
        !enabled
          ? "Sports is disabled by feature flag."
          : "Sports mobile pilot is disabled by feature flag."
      );
      return;
    }

    try {
      const home = await fetchSportsHome({
        signal: controller.signal,
        country: "ZZ",
        platform: "ios",
      });

      if (controller.signal.aborted) return;

      if (!home.enabled) {
        setSections([]);
        setError(home.message || "Sports is disabled.");
        return;
      }

      if (isHomeSectionArray(home.sections)) {
        setSections(home.sections.filter((s) => s.items?.length > 0));
      } else {
        // Legacy object map fallback (should not appear with home IA).
        const legacy: SportsHomeSection[] = [];
        let rank = 10;
        for (const [id, items] of Object.entries(home.sections || {})) {
          if (!items?.length) continue;
          legacy.push({
            id,
            type: "fixtures",
            title: id,
            rank,
            items,
          });
          rank += 10;
        }
        setSections(legacy);
      }
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
  }, [enabled, pilotEnabled]);

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
    async (row: ShelfRow) => {
      if (!enabled || resolveInflight.current) return;
      if (row.kind === "other" || row.kind === "match") {
        // Browse/match cards are metadata-only on home — no autoplay / no poll.
        if (row.kind === "match" && row.playableHint !== "Playable") {
          setError(null);
          setActiveTitle(row.title);
          return;
        }
      }

      resolveInflight.current = true;
      setError(null);
      setEmbedPlayback(null);
      setActiveTitle(row.title);

      try {
        if (row.kind === "video") {
          const result = await resolveSportsVideoPlayback({
            videoId: row.itemId,
            platform: "ios",
            country: "ZZ",
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
              id: row.itemId,
              kind: "video",
              title: row.title,
              positionMs: 0,
            });
            return;
          }
          if (result.playback.mode === "embedded") {
            setEmbedPlayback(result.playback);
            await recordSportsWatchHistory({
              id: row.itemId,
              kind: "video",
              title: row.title,
              positionMs: 0,
            });
            return;
          }
          setError("Native Sports playback is not enabled for this provider.");
          return;
        }

        // Match cards do not resolve on home in Phase 2B (no playback on browse).
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        resolveInflight.current = false;
      }
    },
    [enabled]
  );

  const sectionHeaders = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.sectionId)) return false;
      seen.add(row.sectionId);
      return true;
    });
  }, [rows]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Sports Pilot</Text>
        <Text style={styles.flag}>
          {enabled && pilotEnabled ? "pilot on" : "flag off"}
        </Text>
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
          <Text style={styles.muted}>Loading Sports home…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.hint}>
                Home IA shelves. Empty sections hidden. No autoplay. No polling.
                Same inventory — order may reflect preferences.
              </Text>
              {__DEV__ ? (
                <View style={styles.devRow}>
                  {(
                    [
                      ["anonymous", "Anon"],
                      ["football", "Football"],
                      ["basketball", "Basketball"],
                    ] as const
                  ).map(([id, label]) => (
                    <Pressable
                      key={id}
                      onPress={() => setDevProfile(id)}
                      style={[
                        styles.devChip,
                        devProfile === id ? styles.devChipOn : null,
                      ]}
                    >
                      <Text style={styles.devChipText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {sectionHeaders.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.shelfNav}
                >
                  {sectionHeaders.map((s) => (
                    <View key={s.sectionId} style={styles.shelfChip}>
                      <Text style={styles.shelfChipText}>{s.sectionTitle}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>
                {enabled && pilotEnabled
                  ? "No Sports home sections yet (flags on, inventory empty)."
                  : "Enable Sports + mobile pilot flags to load home IA."}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const prev = index > 0 ? rows[index - 1] : null;
            const showHeader = !prev || prev.sectionId !== item.sectionId;
            return (
              <View>
                {showHeader ? (
                  <Text style={styles.sectionTitle}>{item.sectionTitle}</Text>
                ) : null}
                <Pressable
                  style={styles.row}
                  onPress={() => void onPressItem(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.meta} · {item.playableHint}
                    </Text>
                    {item.reason ? (
                      <Text style={styles.rowReason} numberOfLines={1}>
                        {item.reason}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
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
  shelfNav: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  shelfChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  shelfChipText: { color: "#aaa", fontSize: 12 },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  rowTitle: { color: "#fff", fontSize: 15 },
  rowMeta: { color: "#888", fontSize: 12, marginTop: 4 },
  rowReason: { color: "#6a9", fontSize: 11, marginTop: 2 },
  devRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  devChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#444",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  devChipOn: { borderColor: "#8ab4ff" },
  devChipText: { color: "#ccc", fontSize: 12 },
  embedBox: { height: 280, borderBottomWidth: 1, borderBottomColor: "#222" },
  embedTitle: { color: "#fff", padding: 8, fontSize: 13 },
  webview: { flex: 1, backgroundColor: "#111" },
  closeEmbed: { padding: 10, alignItems: "center" },
  closeEmbedText: { color: "#8ab4ff" },
});
