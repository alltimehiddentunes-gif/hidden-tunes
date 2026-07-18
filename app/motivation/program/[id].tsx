import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { usePlayerState } from "@/context/PlayerContext";
import {
  fetchMotivationProgramDetail,
  formatMotivationDuration,
  searchMotivationItems,
} from "@/services/motivationCatalogApi";
import { loadMotivationProgress } from "@/services/motivationProgress";
import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import {
  enrichMotivationItem,
  groupMotivationItemsIntoPrograms,
  orderMotivationEpisodes,
  takeMotivationGroupedProgram,
  type MotivationVolumeGroup,
} from "@/utils/motivationGrouping";
import {
  extractMotivationProgramTitle,
  sanitizeMotivationDescription,
  sanitizeMotivationTitle,
} from "@/utils/motivationPresentation";
import {
  isMotivationItemAppSong,
  parseMotivationItemSongId,
} from "@/utils/motivationPlaybackAdapter";
import {
  MotivationPlaybackController,
  playMotivationProgramItem,
} from "@/utils/MotivationPlaybackController";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "@/utils/tapPressGuard";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function goBackWithinMotivation() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/motivation" as never);
}

const DESCRIPTION_PREVIEW = 220;
const playSessionTapGuard = createTapGuardState();
const queueActionTapGuard = createTapGuardState();

const SessionRow = memo(function SessionRow({
  item,
  index,
  isPlaying,
  isLoading,
  hasResume,
  onPress,
}: {
  item: MotivationItem;
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  hasResume?: boolean;
  onPress: () => void;
}) {
  const episodeLabel = item.episode_number ?? index + 1;
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
            {episodeLabel}
          </Text>
        )}
      </View>
      <View style={styles.sessionCopy}>
        <Text style={[styles.sessionTitle, isPlaying && styles.sessionTitleActive]} numberOfLines={2}>
          {sanitizeMotivationTitle(item.title)}
        </Text>
        <Text style={styles.sessionMeta}>
          {formatMotivationDuration(item.duration_seconds) || "Episode"}
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
  const cleanId = decodeURIComponent(String(id || "").trim());
  const { currentSong, isLoading } = usePlayerState();
  const abortRef = useRef<AbortController | null>(null);

  const [program, setProgram] = useState<MotivationProgram | null>(null);
  const [items, setItems] = useState<MotivationItem[]>([]);
  const [volumes, setVolumes] = useState<MotivationVolumeGroup[]>([]);
  const [selectedVolume, setSelectedVolume] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [resumeItemId, setResumeItemId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!cleanId) {
      setLoading(false);
      setError("Missing Motivationals program.");
      return;
    }

    const stashed = takeMotivationGroupedProgram(cleanId);
    if (stashed) {
      setProgram(stashed.program);
      setItems(stashed.items);
      setVolumes(stashed.volumes);
      setSelectedVolume(stashed.volumes[0]?.volumeNumber ?? null);
      setLoading(false);
      setError(null);
      try {
        const progress = await loadMotivationProgress(stashed.items[0]?.id || stashed.program.id);
        if (progress && !progress.completed) setResumeItemId(progress.itemId);
      } catch {
        // optional
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      if (cleanId.startsWith("synthetic:")) {
        const titleHint = cleanId.replace(/^synthetic:/, "").split("__")[0]?.replace(/-/g, " ");
        const search = await searchMotivationItems(titleHint || "motivation", {
          page: 1,
          limit: 40,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const groups = groupMotivationItemsIntoPrograms(search.items, {
          excludeMisplacedAudiobooks: false,
        });
        const matched =
          groups.find((group) => group.id === cleanId) ||
          groups.find((group) =>
            extractMotivationProgramTitle(group.program.title)
              .toLowerCase()
              .includes(String(titleHint || "").toLowerCase())
          ) ||
          groups[0];
        if (!matched) throw new Error("Program not found.");
        setProgram(matched.program);
        setItems(matched.items);
        setVolumes(matched.volumes);
        setSelectedVolume(matched.volumes[0]?.volumeNumber ?? null);
      } else {
        const detail = await fetchMotivationProgramDetail(cleanId, {
          page: 1,
          limit: 40,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        let nextItems = orderMotivationEpisodes(detail.items.map(enrichMotivationItem));
        let nextProgram: MotivationProgram = {
          ...detail.program,
          title: sanitizeMotivationTitle(detail.program.title),
          description: sanitizeMotivationDescription(detail.program.description),
        };
        let nextVolumes: MotivationVolumeGroup[] = [
          { volumeNumber: null, label: "Episodes", items: nextItems },
        ];

        if (detail.standalone || nextItems.length <= 1) {
          const seed = nextItems[0];
          if (seed) {
            const related = await searchMotivationItems(
              extractMotivationProgramTitle(seed.title),
              { page: 1, limit: 40, signal: controller.signal }
            );
            if (!controller.signal.aborted) {
              const groups = groupMotivationItemsIntoPrograms(
                [seed, ...related.items],
                { excludeMisplacedAudiobooks: false }
              );
              const matched = groups[0];
              if (matched && matched.items.length >= nextItems.length) {
                nextItems = matched.items;
                nextProgram = matched.program;
                nextVolumes = matched.volumes;
              }
            }
          }
        } else {
          const regrouped = groupMotivationItemsIntoPrograms(nextItems, {
            excludeMisplacedAudiobooks: false,
          });
          if (regrouped[0]) nextVolumes = regrouped[0].volumes;
        }

        setProgram(nextProgram);
        setItems(nextItems);
        setVolumes(nextVolumes);
        setSelectedVolume(nextVolumes[0]?.volumeNumber ?? null);
        try {
          const progress = await loadMotivationProgress(nextItems[0]?.id || nextProgram.id);
          if (!controller.signal.aborted && progress && !progress.completed) {
            setResumeItemId(progress.itemId);
          }
        } catch {
          // optional
        }
      }
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setProgram(null);
      setItems([]);
      setError("Couldn't load this program. Tap to retry.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [cleanId]);

  useEffect(() => {
    void loadDetail();
    return () => abortRef.current?.abort();
  }, [loadDetail]);

  const visibleItems = useMemo(() => {
    if (!volumes.length || selectedVolume == null) return items;
    const match = volumes.find((volume) => volume.volumeNumber === selectedVolume);
    return match?.items || items;
  }, [items, selectedVolume, volumes]);

  const activeItemId = isMotivationItemAppSong(currentSong)
    ? parseMotivationItemSongId(currentSong?.id)
    : null;

  const description = sanitizeMotivationDescription(program?.description);
  const descriptionNeedsCollapse = description.length > DESCRIPTION_PREVIEW;
  const descriptionShown =
    descriptionExpanded || !descriptionNeedsCollapse
      ? description
      : `${description.slice(0, DESCRIPTION_PREVIEW).trim()}…`;

  const playFrom = useCallback(
    async (startItemId: string) => {
      if (!program) return;
      if (shouldIgnoreDuplicateTap(playSessionTapGuard, `motivation-play:${startItemId}`)) {
        return;
      }
      setPlayingItemId(startItemId);
      setPlayError(null);
      try {
        await playMotivationProgramItem({
          program,
          items,
          startItemId,
          contextType: items.length > 1 ? "motivational-program" : "standalone",
          contextSlug: program.category_slug || undefined,
          page: 1,
          hasMore: false,
        });
      } catch {
        setPlayError("Couldn't start playback. Try again.");
      } finally {
        setPlayingItemId(null);
      }
    },
    [items, program]
  );

  const queueProgram = useCallback(
    async (mode: "next" | "queue") => {
      if (!program || !items.length) return;
      if (shouldIgnoreDuplicateTap(queueActionTapGuard, `motivation-queue:${mode}:${program.id}`)) {
        return;
      }
      setQueueMessage(null);
      try {
        if (mode === "next") {
          await MotivationPlaybackController.playNext(items, program);
          setQueueMessage("Playing next");
        } else {
          await MotivationPlaybackController.addToQueue(items, program);
          setQueueMessage("Added to queue");
        }
      } catch {
        setQueueMessage("Couldn't update queue");
      }
    },
    [items, program]
  );

  if (loading) {
    return (
      <AppShell>
        <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
          <View style={styles.loadingHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={goBackWithinMotivation}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        </LinearGradient>
      </AppShell>
    );
  }

  if (!program) {
    return (
      <AppShell>
        <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
          <View style={styles.loadingHeader}>
            <TouchableOpacity style={styles.backButton} onPress={goBackWithinMotivation}>
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyText}>{error || "Program not found."}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadDetail()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </AppShell>
    );
  }

  const startItemId = resumeItemId || items[0]?.id;
  const showVolumeTabs = volumes.length > 1;

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.hero}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={goBackWithinMotivation}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              {program.artwork_url ? (
                <Image
                  source={{ uri: program.artwork_url }}
                  style={styles.heroArt}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.heroArt, styles.heroArtPlaceholder]}>
                  <Ionicons name="flame" size={42} color={COLORS.primary} />
                </View>
              )}
              <Text style={styles.heroTitle}>{program.title}</Text>
              {program.subtitle ? <Text style={styles.heroSubtitle}>{program.subtitle}</Text> : null}
              <Text style={styles.heroMeta}>
                {[
                  items.length > 1 ? `${items.length} episodes` : "1 episode",
                  formatMotivationDuration(program.total_duration_seconds),
                  program.category_slug?.replace(/-/g, " "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {description ? (
                <View style={styles.descriptionBlock}>
                  <Text style={styles.heroDescription}>{descriptionShown}</Text>
                  {descriptionNeedsCollapse ? (
                    <TouchableOpacity
                      onPress={() => setDescriptionExpanded((value) => !value)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.readMore}>
                        {descriptionExpanded ? "Show less" : "Read more"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.heroActions}>
                {startItemId ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    activeOpacity={0.88}
                    onPress={() => void playFrom(startItemId)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {resumeItemId ? "Continue" : "Play"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {items[0]?.id ? (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    activeOpacity={0.88}
                    onPress={() => void playFrom(items[0].id)}
                  >
                    <Text style={styles.secondaryButtonText}>Play from beginning</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.88}
                  onPress={() => void queueProgram("next")}
                >
                  <Text style={styles.secondaryButtonText}>Play Next</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.88}
                  onPress={() => void queueProgram("queue")}
                >
                  <Text style={styles.secondaryButtonText}>Add to Queue</Text>
                </TouchableOpacity>
              </View>
              {playError ? <Text style={styles.playError}>{playError}</Text> : null}
              {queueMessage ? <Text style={styles.queueMessage}>{queueMessage}</Text> : null}
              {showVolumeTabs ? (
                <View style={styles.volumeRow}>
                  {volumes.map((volume) => (
                    <TouchableOpacity
                      key={volume.label}
                      style={[
                        styles.volumeChip,
                        selectedVolume === volume.volumeNumber && styles.volumeChipActive,
                      ]}
                      onPress={() => setSelectedVolume(volume.volumeNumber)}
                    >
                      <Text
                        style={[
                          styles.volumeChipText,
                          selectedVolume === volume.volumeNumber && styles.volumeChipTextActive,
                        ]}
                      >
                        {volume.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <Text style={styles.sectionTitle}>Episodes</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <SessionRow
              item={item}
              index={index}
              isPlaying={activeItemId === item.id}
              isLoading={isLoading && playingItemId === item.id}
              hasResume={resumeItemId === item.id}
              onPress={() => void playFrom(item.id)}
            />
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No episodes yet.</Text>}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  loadingHeader: { paddingTop: 56, paddingHorizontal: 16 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  hero: { paddingTop: 56, paddingBottom: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  heroArt: { width: "100%", height: 220, borderRadius: 24, marginBottom: 16 },
  heroArtPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroTitle: { color: COLORS.text, fontSize: 28, fontWeight: "900" },
  heroSubtitle: { color: COLORS.primary, fontSize: 14, fontWeight: "700", marginTop: 8 },
  heroMeta: { color: COLORS.textMuted, fontSize: 13, marginTop: 8, textTransform: "capitalize" },
  descriptionBlock: { marginTop: 12 },
  heroDescription: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  readMore: { color: COLORS.primary, fontWeight: "800", marginTop: 8 },
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryButtonText: { color: COLORS.text, fontWeight: "800" },
  playError: { color: "#FB923C", fontSize: 13, fontWeight: "700", marginTop: 12 },
  queueMessage: { color: COLORS.primary, fontSize: 13, fontWeight: "700", marginTop: 10 },
  volumeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  volumeChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  volumeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  volumeChipText: { color: COLORS.text, fontWeight: "700", fontSize: 13 },
  volumeChipTextActive: { color: "#00130D" },
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
  emptyText: { color: COLORS.textMuted, textAlign: "center", marginTop: 24 },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: { color: "#00130D", fontWeight: "900" },
});
