import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "@/constants/theme";
import { usePlayerState } from "@/context/PlayerContext";
import {
  fetchMotivationProgramDetail,
  formatMotivationDuration,
} from "@/services/motivationCatalogApi";
import { loadMotivationProgress } from "@/services/motivationProgress";
import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import {
  isMotivationItemAppSong,
  parseMotivationItemSongId,
} from "@/utils/motivationPlaybackAdapter";
import { playMotivationProgramItem } from "@/utils/MotivationPlaybackController";

const SessionRow = memo(function SessionRow({
  item,
  isPlaying,
  isLoading,
  hasResume,
  onPress,
}: {
  item: MotivationItem;
  isPlaying: boolean;
  isLoading: boolean;
  hasResume?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.sessionRow, isPlaying && styles.sessionRowActive]}
      activeOpacity={0.86}
      onPress={onPress}
      disabled={isLoading}
    >
      <View style={[styles.sessionBadge, isPlaying && styles.sessionBadgeActive]}>
        {isLoading ? (
          <ActivityIndicator size="small" color={isPlaying ? "#00130D" : COLORS.primary} />
        ) : (
          <Text style={[styles.sessionNumber, isPlaying && styles.sessionNumberActive]}>
            {item.episode_number ?? item.sort_order ?? "•"}
          </Text>
        )}
      </View>
      <View style={styles.sessionCopy}>
        <Text style={[styles.sessionTitle, isPlaying && styles.sessionTitleActive]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.sessionMeta}>
          {formatMotivationDuration(item.duration_seconds) || "Session"}
          {hasResume ? " · Resume" : ""}
        </Text>
      </View>
      <Ionicons
        name={isPlaying ? "volume-high" : "play-circle-outline"}
        size={22}
        color={isPlaying ? COLORS.primary : COLORS.textMuted}
      />
    </TouchableOpacity>
  );
});

export default function MotivationProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentSong, isLoading } = usePlayerState();
  const [program, setProgram] = useState<MotivationProgram | null>(null);
  const [items, setItems] = useState<MotivationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [resumeItemId, setResumeItemId] = useState<string | null>(null);

  useEffect(() => {
    const cleanId = String(id || "").trim();
    if (!cleanId) return;
    let cancelled = false;

    void fetchMotivationProgramDetail(cleanId, { page: 1, limit: 40 })
      .then(async (detail) => {
        if (cancelled) return;
        setProgram(detail.program);
        setItems(detail.items);
        const progress = await loadMotivationProgress(
          detail.items[0]?.id || detail.program.id
        );
        if (progress && !progress.completed) setResumeItemId(progress.itemId);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const activeItemId = isMotivationItemAppSong(currentSong)
    ? parseMotivationItemSongId(currentSong?.id)
    : null;

  const playFrom = useCallback(
    async (startItemId: string) => {
      if (!program) return;
      setPlayingItemId(startItemId);
      try {
        await playMotivationProgramItem({
          program,
          items,
          startItemId,
          contextType: items.length > 1 ? "program" : "standalone",
          contextSlug: program.category_slug || undefined,
          page: 1,
          hasMore: (program.session_count || items.length) > items.length,
        });
      } finally {
        setPlayingItemId(null);
      }
    },
    [items, program]
  );

  if (loading || !program) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const startItemId = resumeItemId || items[0]?.id;

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.hero}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            {program.artwork_url ? (
              <Image source={{ uri: program.artwork_url }} style={styles.heroArt} contentFit="cover" />
            ) : null}
            <Text style={styles.heroTitle}>{program.title}</Text>
            {program.subtitle ? <Text style={styles.heroSubtitle}>{program.subtitle}</Text> : null}
            {program.description ? (
              <Text style={styles.heroDescription}>{program.description}</Text>
            ) : null}
            <View style={styles.heroActions}>
              {startItemId ? (
                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.88}
                  onPress={() => void playFrom(startItemId)}
                >
                  <Text style={styles.primaryButtonText}>
                    {resumeItemId ? "Continue Listening" : "Play"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {items[0]?.id ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.88}
                  onPress={() => void playFrom(items[0].id)}
                >
                  <Text style={styles.secondaryButtonText}>Play from Beginning</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.sectionTitle}>Sessions</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SessionRow
            item={item}
            isPlaying={activeItemId === item.id}
            isLoading={isLoading && playingItemId === item.id}
            hasResume={resumeItemId === item.id}
            onPress={() => void playFrom(item.id)}
          />
        )}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 56, paddingBottom: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  heroArt: { width: "100%", height: 220, borderRadius: 24, marginBottom: 16 },
  heroTitle: { color: COLORS.text, fontSize: 28, fontWeight: "900" },
  heroSubtitle: { color: COLORS.primary, fontSize: 14, fontWeight: "700", marginTop: 8 },
  heroDescription: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: { color: "#00130D", fontWeight: "900" },
  secondaryButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryButtonText: { color: COLORS.text, fontWeight: "800" },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "900", marginTop: 24 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  sessionRowActive: {
    borderColor: "rgba(168,85,247,0.45)",
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  sessionBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sessionBadgeActive: { backgroundColor: COLORS.primary },
  sessionNumber: { color: COLORS.text, fontWeight: "900", fontSize: 13 },
  sessionNumberActive: { color: "#00130D" },
  sessionCopy: { flex: 1 },
  sessionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  sessionTitleActive: { color: COLORS.text },
  sessionMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
});
