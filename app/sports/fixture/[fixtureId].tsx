/**
 * Fixture detail — partial data is omitted rather than shown as "N/A".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SportsErrorState,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsReminderButton,
  SportsSection,
  SportsStatusBadge,
  SportsVideoCard,
} from "../../../components/sports";
import {
  addSportsWatchLater,
  clearSportsReminder,
  fetchSportsFixtureDetail,
  getSportsFavorites,
  getSportsReminders,
  getSportsWatchLater,
  removeSportsFavorite,
  removeSportsWatchLater,
  saveSportsFavorite,
  setSportsReminder,
} from "../../../services/sports";
import { formatKickoff } from "../../../lib/sports/ui/formatKickoff";
import { formatMatchTitle, formatScore, participantBySide } from "../../../lib/sports/ui/formatScore";
import {
  canShowWatchAction,
  formatStatusLabel,
  getSportsWatchAction,
  openSportsPlayer,
  primaryActionLabel,
} from "../../../lib/sports/ui/formatStatus";
import type {
  SportsFixtureDetail,
  SportsMatchCard as SportsMatchCardType,
  SportsVideoCard as SportsVideoCardType,
} from "../../../types/sports";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

import { CenterSpinner, DetailRow, SPORTS_COLORS, SportsScreenHeader, useSportsFullUiGate, useSportsNowClock } from "../_shared";

export default function FixtureDetailScreen() {
  const gate = useSportsFullUiGate();
  const params = useLocalSearchParams<{ fixtureId?: string }>();
  const fixtureId = String(params.fixtureId || "").trim();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixture, setFixture] = useState<SportsFixtureDetail | null>(null);
  const [saved, setSaved] = useState(false);
  const [watchLater, setWatchLater] = useState(false);
  const [reminded, setReminded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const watchGuardRef = useRef(createTapGuardState());

  const load = useCallback(async () => {
    if (!fixtureId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const [res, favorites, watchLaterList, reminders] = await Promise.all([
        fetchSportsFixtureDetail(fixtureId, {
          signal: controller.signal,
          country: "ZZ",
          platform: Platform.OS,
        }),
        getSportsFavorites(),
        getSportsWatchLater(),
        getSportsReminders(),
      ]);
      if (controller.signal.aborted) return;

      if (!res.enabled) {
        setError("Sports is unavailable right now.");
        return;
      }
      if (!res.fixture) {
        setError(res.message || "This match was not found.");
        return;
      }
      setFixture(res.fixture);
      setSaved(favorites.some((f) => f.kind === "fixture" && f.id === fixtureId));
      setWatchLater(watchLaterList.some((f) => f.kind === "fixture" && f.id === fixtureId));
      setReminded(reminders.some((r) => r.fixtureId === fixtureId));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "This match could not be loaded right now.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => abortRef.current?.abort();
  }, [gate.allowed, load]);

  const title = useMemo(() => (fixture ? formatMatchTitle(fixture) : ""), [fixture]);
  const home = fixture ? participantBySide(fixture.participants, "home") : undefined;
  const away = fixture ? participantBySide(fixture.participants, "away") : undefined;
  const score = fixture ? formatScore(fixture) : null;
  const action = fixture ? primaryActionLabel(fixture) : null;
  const canWatch = fixture ? action && action !== "Remind me" && canShowWatchAction(fixture) : false;
  const notStarted = fixture ? !fixture.status?.live && !fixture.status?.finished : false;

  const goWatch = useCallback(() => {
    if (!fixture) return;
    if (shouldIgnoreDuplicateTap(watchGuardRef.current, `watch:${fixture.id}`)) return;
    const action = getSportsWatchAction(fixture);
    if (
      action.kind === "watch_live" ||
      action.kind === "replay" ||
      action.kind === "highlights" ||
      action.kind === "watch_external" ||
      action.kind === "subscription"
    ) {
      openSportsPlayer(fixture.id);
    }
  }, [fixture]);

  const toggleSaved = useCallback(async () => {
    if (!fixture) return;
    if (saved) {
      await removeSportsFavorite("fixture", fixture.id);
      setSaved(false);
    } else {
      await saveSportsFavorite({ id: fixture.id, kind: "fixture", title });
      setSaved(true);
    }
  }, [fixture, saved, title]);

  const toggleWatchLater = useCallback(async () => {
    if (!fixture) return;
    if (watchLater) {
      await removeSportsWatchLater("fixture", fixture.id);
      setWatchLater(false);
    } else {
      await addSportsWatchLater({ id: fixture.id, kind: "fixture", title });
      setWatchLater(true);
    }
  }, [fixture, watchLater, title]);

  const toggleReminder = useCallback(async () => {
    if (!fixture) return;
    if (reminded) {
      await clearSportsReminder(fixture.id);
      setReminded(false);
    } else {
      await setSportsReminder({
        fixtureId: fixture.id,
        title,
        startsAt: fixture.timing?.startsAt || null,
      });
      setReminded(true);
    }
  }, [fixture, reminded, title]);

  const onPressRelated = useCallback((card: SportsMatchCardType) => {
    router.push(`/sports/fixture/${encodeURIComponent(card.id)}` as any);
  }, []);
  const onPressVideo = useCallback(
    (v: SportsVideoCardType) => {
      if (v.fixtureId && v.fixtureId !== fixtureId) {
        router.push(`/sports/fixture/${encodeURIComponent(v.fixtureId)}` as any);
      }
    },
    [fixtureId]
  );

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsScreenHeader title="Match" />
        <SportsErrorState title="Sports isn't available yet" message={gate.reason} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SportsScreenHeader title={title || "Match"} subtitle={fixture?.competition?.name} />

      {loading ? (
        <CenterSpinner label="Loading match…" />
      ) : error || !fixture ? (
        <SportsErrorState message={error || "This match was not found."} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.scoreCard}>
            <View style={styles.scoreTop}>
              <SportsStatusBadge code={fixture.status?.code} label={fixture.status?.label} />
              {fixture.timing?.minute != null ? (
                <Text style={styles.minute}>{`${fixture.timing.minute}'`}</Text>
              ) : null}
            </View>
            <View style={styles.participantsWrap}>
              <ParticipantBlock name={home?.name} score={score ? home?.score : null} />
              <Text style={styles.vs}>vs</Text>
              <ParticipantBlock name={away?.name} score={score ? away?.score : null} />
            </View>
            {canWatch ? (
              <Pressable style={styles.watchBtn} onPress={goWatch}>
                <Ionicons name="play" size={15} color={SPORTS_COLORS.navy} />
                <Text style={styles.watchBtnText}>{action}</Text>
              </Pressable>
            ) : null}

            <View style={styles.actionsRow}>
              <ActionChip
                icon={saved ? "bookmark" : "bookmark-outline"}
                label="Save"
                active={saved}
                onPress={toggleSaved}
              />
              <ActionChip
                icon={watchLater ? "time" : "time-outline"}
                label="Watch later"
                active={watchLater}
                onPress={toggleWatchLater}
              />
              {notStarted ? (
                <SportsReminderButton reminded={reminded} onToggle={toggleReminder} size="sm" />
              ) : null}
            </View>
          </View>

          <View style={styles.detailsCard}>
            <DetailRow
              label="Competition"
              value={fixture.competition?.name?.trim() || "Competition unavailable"}
            />
            <DetailRow
              label="Kickoff"
              value={formatKickoff(fixture.timing?.startsAt, nowMs) || "Time unavailable"}
            />
            <DetailRow
              label="Venue"
              value={
                fixture.venue?.name
                  ? [fixture.venue.name, fixture.venue.city].filter(Boolean).join(", ")
                  : null
              }
            />
            <DetailRow label="Status" value={formatStatusLabel(fixture.status?.code, fixture.status?.label)} />
          </View>

          {fixture.timeline?.length ? (
            <View>
              <View style={styles.timelineHeaderWrap}>
                <Text style={styles.timelineHeaderText}>Match events</Text>
              </View>
              <View style={styles.timelineWrap}>
                {fixture.timeline.map((event) => (
                  <View key={event.id} style={styles.timelineRow}>
                    <Text style={styles.timelineMinute}>
                      {event.minute != null ? `${event.minute}'` : ""}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineLabel}>{event.label}</Text>
                      {event.detail ? <Text style={styles.timelineDetail}>{event.detail}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {fixture.highlights?.length ? (
            <SportsSection title="Highlights">
              <SportsHorizontalShelf>
                {fixture.highlights.map((v) => (
                  <SportsVideoCard key={v.id} video={v} onPress={onPressVideo} />
                ))}
              </SportsHorizontalShelf>
            </SportsSection>
          ) : null}

          {fixture.replays?.length ? (
            <SportsSection title="Replays">
              <SportsHorizontalShelf>
                {fixture.replays.map((v) => (
                  <SportsVideoCard key={v.id} video={v} onPress={onPressVideo} />
                ))}
              </SportsHorizontalShelf>
            </SportsSection>
          ) : null}

          {fixture.relatedFixtures?.length ? (
            <SportsSection title="Related fixtures">
              <SportsHorizontalShelf columns={1}>
                {fixture.relatedFixtures.slice(0, 6).map((card) => (
                  <SportsMatchCard key={card.id} card={card} nowMs={nowMs} onPress={onPressRelated} />
                ))}
              </SportsHorizontalShelf>
            </SportsSection>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ParticipantBlock({ name, score }: { name?: string | null; score?: string | number | null }) {
  const label = name?.trim() || "Unknown team";
  return (
    <View style={styles.participantBlock}>
      <Text style={styles.participantBlockName} numberOfLines={2}>
        {label}
      </Text>
      {score != null && String(score).length > 0 ? (
        <Text style={styles.participantBlockScore}>{score}</Text>
      ) : (
        <Text style={styles.participantBlockScoreMuted}>Score unavailable</Text>
      )}
    </View>
  );
}

function ActionChip({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.actionChip, active ? styles.actionChipActive : null]} onPress={onPress}>
      <Ionicons name={icon} size={14} color={active ? SPORTS_COLORS.navy : SPORTS_COLORS.textMuted} />
      <Text style={[styles.actionChipText, active ? styles.actionChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
  scoreCard: {
    margin: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: SPORTS_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    gap: 12,
  },
  scoreTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  minute: { color: SPORTS_COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  participantsWrap: { flexDirection: "row", alignItems: "center", gap: 12 },
  participantBlock: { flex: 1, alignItems: "center", gap: 4 },
  participantBlockName: { color: SPORTS_COLORS.text, fontSize: 14, fontWeight: "700", textAlign: "center" },
  participantBlockScore: { color: SPORTS_COLORS.text, fontSize: 26, fontWeight: "900" },
  participantBlockScoreMuted: { color: SPORTS_COLORS.textDim, fontSize: 11, fontWeight: "600" },
  vs: { color: SPORTS_COLORS.textDim, fontSize: 12, fontWeight: "700" },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: SPORTS_COLORS.amber,
    borderRadius: 24,
    paddingVertical: 12,
  },
  watchBtnText: { color: SPORTS_COLORS.navy, fontSize: 14, fontWeight: "800" },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },
  actionChipActive: { backgroundColor: SPORTS_COLORS.amber, borderColor: SPORTS_COLORS.amber },
  actionChipText: { color: SPORTS_COLORS.textMuted, fontSize: 11.5, fontWeight: "700" },
  actionChipTextActive: { color: SPORTS_COLORS.navy },
  detailsCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: SPORTS_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },
  timelineHeaderWrap: { paddingHorizontal: 18, marginBottom: 14, marginTop: 4 },
  timelineHeaderText: { color: SPORTS_COLORS.text, fontSize: 18, fontWeight: "900" },
  timelineWrap: { paddingHorizontal: 16, gap: 10, marginBottom: 26 },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineMinute: { color: SPORTS_COLORS.amber, fontSize: 12, fontWeight: "800", width: 32 },
  timelineLabel: { color: SPORTS_COLORS.text, fontSize: 13, fontWeight: "700" },
  timelineDetail: { color: SPORTS_COLORS.textDim, fontSize: 11.5, marginTop: 1 },
});
