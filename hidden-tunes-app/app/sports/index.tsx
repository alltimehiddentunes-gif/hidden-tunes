/**
 * Sports home — full IA.
 * Gated on sports_enabled + sports_mobile_pilot_enabled + sports_full_ui_enabled
 * via isSportsFullUiEnabled(). Never mounted from bottom tabs; entered from the
 * Discovery hub "Sports Preview" card (dev-only) or a direct route push.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SportsCompetitionShelf,
  SportsCountryGrid,
  SportsHero,
  SportsHeroSkeleton,
  SportsHeader,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsMatchCardSkeleton,
  SportsScheduleSection,
  SportsSection,
  SportsSkeletonRow,
  SportsVideoCard,
  SportsWorldGrid,
} from "../../components/sports";
import { isSportsClientEnabled } from "../../constants/sportsFlags";
import {
  SportsPlaybackProvider,
  useSportsPlayback,
} from "../../context/SportsPlaybackContext";
import { omitEmptySportsSections, pickSportsHero } from "../../lib/sports/ui/homeSections";
import {
  followSportsEntity,
  getSportsFavorites,
  getSportsFollows,
  getSportsReminders,
  fetchSportsHome,
  removeSportsFavorite,
  saveSportsFavorite,
  setSportsReminder,
  clearSportsReminder,
  unfollowSportsEntity,
} from "../../services/sports";
import type {
  SportsCompetitionCard as SportsCompetitionCardType,
  SportsCountryCard as SportsCountryCardType,
  SportsHomeSection,
  SportsMatchCard as SportsMatchCardType,
  SportsVideoCard as SportsVideoCardType,
  SportsWorldCard as SportsWorldCardType,
} from "../../types/sports";
import {
  createTapGuardState,
  shouldIgnoreDuplicateTap,
} from "../../utils/tapPressGuard";

import { SPORTS_COLORS, SportsDisabledState, useSportsFullUiGate, useSportsNowClock } from "./_shared";

type DevProfile = "anonymous" | "football" | "basketball";

/** Development-only local reordering demo — never active in production builds. */
function applyDevProfile(
  sections: SportsHomeSection[],
  profile: DevProfile
): SportsHomeSection[] {
  if (!__DEV__ || profile === "anonymous") return sections;
  if (
    !isSportsClientEnabled("sports_enabled") ||
    !isSportsClientEnabled("sports_mobile_pilot_enabled")
  ) {
    return sections;
  }
  return sections.map((section) => {
    if (section.type !== "fixtures" && section.type !== "live") return section;
    if (section.id === "continue_watching" || section.id === "trending") {
      return section;
    }
    const items = [...section.items].sort((a, b) => {
      const ca = a as SportsMatchCardType;
      const cb = b as SportsMatchCardType;
      const sa = ca.sport?.slug === profile ? 0 : 1;
      const sb = cb.sport?.slug === profile ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return String(ca.id).localeCompare(String(cb.id));
    });
    return { ...section, items };
  });
}

function mergeSectionErrors(
  sections: SportsHomeSection[],
  sectionErrors?: { section: string; error: string }[]
): SportsHomeSection[] {
  if (!sectionErrors?.length) return sections;
  const errorMap = new Map(sectionErrors.map((e) => [e.section, e.error]));
  return sections.map((section) =>
    errorMap.has(section.id) ? { ...section, error: errorMap.get(section.id) } : section
  );
}

function SportsHomeInner() {
  const gate = useSportsFullUiGate();
  const sportsPlayback = useSportsPlayback();
  const nowMs = useSportsNowClock();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SportsHomeSection[]>([]);
  const [devProfile, setDevProfile] = useState<DevProfile>("anonymous");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [savedFixtureIds, setSavedFixtureIds] = useState<Set<string>>(new Set());
  const [followedCompetitionIds, setFollowedCompetitionIds] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const watchGuardRef = useRef(createTapGuardState());
  const navGuardRef = useRef(createTapGuardState());

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const [home, reminders, favorites, follows] = await Promise.all([
        fetchSportsHome({ signal: controller.signal, country: "ZZ", platform: Platform.OS }),
        getSportsReminders(),
        getSportsFavorites(),
        getSportsFollows(),
      ]);
      if (controller.signal.aborted) return;

      setRemindedIds(new Set(reminders.map((r) => r.fixtureId)));
      setSavedFixtureIds(new Set(favorites.filter((f) => f.kind === "fixture").map((f) => f.id)));
      setFollowedCompetitionIds(
        new Set(follows.filter((f) => f.type === "competition").map((f) => f.id))
      );

      if (!home.enabled) {
        setSections([]);
        setError(home.message || "Sports is unavailable right now.");
        return;
      }

      const raw = Array.isArray(home.sections) ? home.sections : [];
      const merged = mergeSectionErrors(raw, home.sectionErrors);
      setSections(omitEmptySportsSections(merged));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Sports could not be loaded right now.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!gate.allowed) return;
    void load();
    return () => {
      abortRef.current?.abort();
      sportsPlayback.stop();
    };
  }, [gate.allowed, load, sportsPlayback]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const displaySections = useMemo(
    () => applyDevProfile(sections, devProfile),
    [sections, devProfile]
  );
  const hero = useMemo(() => pickSportsHero(displaySections), [displaySections]);

  const goSearch = useCallback(() => router.push("/sports/search" as any), []);
  const goFollowing = useCallback(() => router.push("/sports/following" as any), []);
  const goSaved = useCallback(() => router.push("/sports/saved" as any), []);

  const goFixture = useCallback((id: string) => {
    if (!id) return;
    router.push(`/sports/fixture/${encodeURIComponent(id)}` as any);
  }, []);
  const goSport = useCallback((slug: string) => {
    if (!slug) return;
    router.push(`/sports/sport/${encodeURIComponent(slug)}` as any);
  }, []);
  const goCompetition = useCallback((id: string) => {
    if (!id) return;
    router.push(`/sports/competition/${encodeURIComponent(id)}` as any);
  }, []);
  const goWatch = useCallback((fixtureId: string) => {
    if (!fixtureId) return;
    if (shouldIgnoreDuplicateTap(watchGuardRef.current, `watch:${fixtureId}`)) return;
    router.push(`/sports/player/${encodeURIComponent(fixtureId)}` as any);
  }, []);

  const onPressMatch = useCallback(
    (card: SportsMatchCardType) => {
      if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
      goFixture(card.id);
    },
    [goFixture]
  );
  const onWatchMatch = useCallback((card: SportsMatchCardType) => goWatch(card.id), [goWatch]);
  const onRemindMatch = useCallback(async (card: SportsMatchCardType) => {
    const isReminded = remindedIds.has(card.id);
    if (isReminded) {
      await clearSportsReminder(card.id);
      setRemindedIds((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    } else {
      await setSportsReminder({
        fixtureId: card.id,
        title: card.competition?.name || card.sport?.name || "Match",
        startsAt: card.timing?.startsAt || null,
      });
      setRemindedIds((prev) => new Set(prev).add(card.id));
    }
  }, [remindedIds]);
  const onSaveMatch = useCallback(async (card: SportsMatchCardType) => {
    const isSaved = savedFixtureIds.has(card.id);
    if (isSaved) {
      await removeSportsFavorite("fixture", card.id);
      setSavedFixtureIds((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    } else {
      await saveSportsFavorite({
        id: card.id,
        kind: "fixture",
        title: card.competition?.name || card.sport?.name || "Match",
      });
      setSavedFixtureIds((prev) => new Set(prev).add(card.id));
    }
  }, [savedFixtureIds]);

  const onPressCompetition = useCallback(
    (c: SportsCompetitionCardType) => goCompetition(c.id),
    [goCompetition]
  );
  const onToggleFollowCompetition = useCallback(async (c: SportsCompetitionCardType) => {
    const isFollowed = followedCompetitionIds.has(c.id);
    if (isFollowed) {
      await unfollowSportsEntity("competition", c.id);
      setFollowedCompetitionIds((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    } else {
      await followSportsEntity({
        id: c.id,
        type: "competition",
        name: c.name,
        subtitle: c.sportName || c.countryName || null,
        artworkUrl: c.logoUrl || null,
        sportSlug: c.sportSlug || null,
      });
      setFollowedCompetitionIds((prev) => new Set(prev).add(c.id));
    }
  }, [followedCompetitionIds]);

  const onPressSport = useCallback((s: SportsWorldCardType) => goSport(s.slug), [goSport]);
  const onPressCountry = useCallback((c: SportsCountryCardType) => {
    router.push(`/sports/search?q=${encodeURIComponent(c.name)}` as any);
  }, []);
  const onPressVideo = useCallback(
    (v: SportsVideoCardType) => {
      if (v.fixtureId) goFixture(v.fixtureId);
    },
    [goFixture]
  );

  if (!gate.allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SportsDisabledState message={gate.reason} />
      </SafeAreaView>
    );
  }

  const showFullSkeleton = loading && !sections.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <SportsHeader onSearchPress={goSearch} onFollowingPress={goFollowing} />

      <View style={styles.savedLinkRow}>
        <Pressable style={styles.savedLinkBtn} onPress={goSaved} hitSlop={8}>
          <Ionicons name="bookmark-outline" size={14} color={SPORTS_COLORS.textMuted} />
          <Text style={styles.savedLinkText}>Saved</Text>
        </Pressable>
      </View>

      {showFullSkeleton ? (
        <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
          <View style={{ paddingHorizontal: 18, marginBottom: 22 }}>
            <SportsHeroSkeleton />
          </View>
          <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={SPORTS_COLORS.amber}
            />
          }
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.topError}>
              <Text style={styles.topErrorText}>{error}</Text>
              <Pressable onPress={load} hitSlop={10}>
                <Text style={styles.topErrorRetry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

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
                  style={[styles.devChip, devProfile === id ? styles.devChipOn : null]}
                >
                  <Text style={styles.devChipText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {hero ? (
            <View style={{ paddingHorizontal: 18, marginBottom: 22 }}>
              <SportsHero
                card={hero}
                nowMs={nowMs}
                reminded={remindedIds.has(hero.id)}
                onPress={onPressMatch}
                onWatch={onWatchMatch}
                onRemind={onRemindMatch}
              />
            </View>
          ) : null}

          {displaySections.map((section) =>
            renderHomeSection(section, {
              nowMs,
              remindedIds,
              savedFixtureIds,
              followedCompetitionIds,
              onPressMatch,
              onWatchMatch,
              onRemindMatch,
              onSaveMatch,
              onPressCompetition,
              onToggleFollowCompetition,
              onPressSport,
              onPressCountry,
              onPressVideo,
            })
          )}

          {!displaySections.length && !error ? (
            <View style={styles.center}>
              <Text style={styles.centerText}>
                No Sports content is available right now. Pull to refresh.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type HomeSectionHandlers = {
  nowMs: number;
  remindedIds: Set<string>;
  savedFixtureIds: Set<string>;
  followedCompetitionIds: Set<string>;
  onPressMatch: (c: SportsMatchCardType) => void;
  onWatchMatch: (c: SportsMatchCardType) => void;
  onRemindMatch: (c: SportsMatchCardType) => void;
  onSaveMatch: (c: SportsMatchCardType) => void;
  onPressCompetition: (c: SportsCompetitionCardType) => void;
  onToggleFollowCompetition: (c: SportsCompetitionCardType) => void;
  onPressSport: (s: SportsWorldCardType) => void;
  onPressCountry: (c: SportsCountryCardType) => void;
  onPressVideo: (v: SportsVideoCardType) => void;
};

function renderHomeSection(section: SportsHomeSection, h: HomeSectionHandlers) {
  if (section.id === "todays_schedule" && section.type === "fixtures") {
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsScheduleSection
          matches={section.items as SportsMatchCardType[]}
          nowMs={h.nowMs}
          rowVariant="compact"
          onPressMatch={h.onPressMatch}
        />
      </SportsSection>
    );
  }

  if (section.type === "fixtures" || section.type === "live") {
    const variant = section.id === "recently_finished" ? "finished" : "shelf";
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsHorizontalShelf>
          {(section.items as SportsMatchCardType[]).map((card) => (
            <SportsMatchCard
              key={card.id}
              card={card}
              variant={variant}
              nowMs={h.nowMs}
              reminded={h.remindedIds.has(card.id)}
              favorited={h.savedFixtureIds.has(card.id)}
              onPress={h.onPressMatch}
              onWatch={h.onWatchMatch}
              onRemind={h.onRemindMatch}
              onSave={h.onSaveMatch}
            />
          ))}
        </SportsHorizontalShelf>
      </SportsSection>
    );
  }

  if (section.type === "competitions") {
    const items = (section.items as SportsCompetitionCardType[]).map((c) => ({
      ...c,
      followed: h.followedCompetitionIds.has(c.id),
    }));
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsCompetitionShelf
          sectionId={section.id}
          competitions={items}
          onPress={h.onPressCompetition}
          onToggleFollow={h.onToggleFollowCompetition}
        />
      </SportsSection>
    );
  }

  if (section.type === "sports") {
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsWorldGrid sectionId={section.id} sports={section.items as SportsWorldCardType[]} onPress={h.onPressSport} />
      </SportsSection>
    );
  }

  if (section.type === "countries") {
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsCountryGrid countries={section.items as SportsCountryCardType[]} onPress={h.onPressCountry} />
      </SportsSection>
    );
  }

  if (section.type === "videos") {
    return (
      <SportsSection key={section.id} title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsHorizontalShelf>
          {(section.items as SportsVideoCardType[]).map((v) => (
            <SportsVideoCard key={v.id} video={v} onPress={h.onPressVideo} />
          ))}
        </SportsHorizontalShelf>
      </SportsSection>
    );
  }

  return null;
}

export default function SportsHomeScreen() {
  return (
    <SportsPlaybackProvider>
      <SportsHomeInner />
    </SportsPlaybackProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SPORTS_COLORS.background },
  devRow: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 12 },
  devChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SPORTS_COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  devChipOn: { borderColor: SPORTS_COLORS.amber },
  devChipText: { color: SPORTS_COLORS.textMuted, fontSize: 11, fontWeight: "600" },
  topError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,107,107,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.25)",
  },
  topErrorText: { color: SPORTS_COLORS.danger, fontSize: 12, flex: 1 },
  topErrorRetry: { color: SPORTS_COLORS.amber, fontSize: 12, fontWeight: "700" },
  savedLinkRow: { alignItems: "flex-end", paddingHorizontal: 18, paddingBottom: 6 },
  savedLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  savedLinkText: { color: SPORTS_COLORS.textMuted, fontSize: 12, fontWeight: "600" },
  center: { padding: 32, alignItems: "center" },
  centerText: { color: SPORTS_COLORS.textDim, fontSize: 13, textAlign: "center" },
});
