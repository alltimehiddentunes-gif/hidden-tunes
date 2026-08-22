/**
 * Sports home — full IA.
 * Gated on sports_enabled + sports_mobile_pilot_enabled + sports_full_ui_enabled
 * via isSportsFullUiEnabled(). Never mounted from bottom tabs; entered from the
 * Discovery hub "Sports Preview" card (dev-only) or a direct route push.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { markTvCloseDestinationRendered } from "../../services/tv/tvCloseRenderSignal";

import {
  SportsCompetitionShelf,
  SportsCountryGrid,
  SportsEmptyState,
  SportsHero,
  SportsHeroSkeleton,
  SportsHeader,
  SportsHorizontalShelf,
  SportsMatchCard,
  SportsMatchCardSkeleton,
  SportsScheduleSection,
  SportsSection,
  SportsSkeletonRow,
  SportsTvShelf,
  SportsVideoCard,
  SportsWorldGrid,
} from "../../components/sports";
import {
  isSportsClientEnabled,
  sportsLiveScoresEnabled,
  sportsTvEnabled,
} from "../../constants/sportsFlags";
import { useSportsTvCatalog } from "../../hooks/useSportsTvCatalog";
import {
  boundSectionItems,
  ensureLiveNowSection,
  omitEmptySportsSections,
  pickSportsHero,
  sectionItemLimit,
  sortSportsHomeSections,
} from "../../lib/sports/ui/homeSections";
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
import {
  getSportsBrowseCache,
  isSportsBrowseCacheStale,
  sportsHomeCacheKey,
  SPORTS_HOME_STALE_MS,
} from "../../services/sports/sportsBrowseCache";
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
import {
  getSportsWatchAction,
  needsSportsCountdownClock,
  openSportsPlayerIfPlayable,
  shouldOpenSportsPlayer,
} from "../../lib/sports/ui/availability";
import { formatCountdown, formatKickoff } from "../../lib/sports/ui/formatKickoff";
import { formatMatchTitle } from "../../lib/sports/ui/formatScore";

import { SPORTS_COLORS, SportsDisabledState, navigateSportsHomeBack, useSportsFullUiGate, useSportsNowClock } from "./_shared";

type DevProfile = "anonymous" | "football" | "basketball";

type SportFilterId = "all" | "football" | "basketball" | "cricket" | "more";

const SPORT_FILTERS: { id: SportFilterId; label: string; slugs?: string[] }[] = [
  { id: "all", label: "All" },
  { id: "football", label: "Football", slugs: ["football", "soccer"] },
  { id: "basketball", label: "Basketball", slugs: ["basketball"] },
  { id: "cricket", label: "Cricket", slugs: ["cricket"] },
  { id: "more", label: "More" },
];

function matchPassesSportFilter(
  card: SportsMatchCardType,
  filter: SportFilterId
): boolean {
  if (filter === "all") return true;
  const slug = String(card.sport?.slug || "").toLowerCase();
  const name = String(card.sport?.name || "").toLowerCase();
  if (filter === "more") {
    const primary = new Set(["football", "soccer", "basketball", "cricket"]);
    return !primary.has(slug);
  }
  const entry = SPORT_FILTERS.find((f) => f.id === filter);
  const slugs = entry?.slugs || [filter];
  return slugs.some((s) => slug === s || name.includes(s));
}

function filterSectionsBySport(
  sections: SportsHomeSection[],
  filter: SportFilterId
): SportsHomeSection[] {
  if (filter === "all") return sections;
  return sections.map((section) => {
    if (section.type !== "fixtures" && section.type !== "live") return section;
    if (section.id === "live_sports_tv") return section;
    const items = (section.items as SportsMatchCardType[]).filter((card) =>
      matchPassesSportFilter(card, filter)
    );
    return { ...section, items };
  });
}

/** Inject Live Sports TV placeholder section immediately after Live now. */
function ensureLiveSportsTvSection(
  sections: SportsHomeSection[],
  enabled: boolean
): SportsHomeSection[] {
  const without = sections.filter((s) => s.id !== "live_sports_tv");
  if (!enabled) return without;
  const liveIdx = without.findIndex((s) => s.id === "live_now");
  const tvSection: SportsHomeSection = {
    id: "live_sports_tv",
    type: "tv_channels",
    title: "Live Sports TV",
    subtitle: "Sports channels from the Hidden Tunes TV catalog",
    rank: 15,
    items: [{ id: "sports-tv-surface" }],
  };
  if (liveIdx < 0) return sortSportsHomeSections([tvSection, ...without]);
  const next = [...without];
  next.splice(liveIdx + 1, 0, tvSection);
  return sortSportsHomeSections(next);
}

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

/** Hide browse sports with no backing fixtures in the current home payload. */
function filterUnsupportedHomeSections(sections: SportsHomeSection[]): SportsHomeSection[] {
  const slugsWithFixtures = new Set<string>();
  for (const section of sections) {
    if (section.type !== "fixtures" && section.type !== "live") continue;
    for (const item of section.items || []) {
      const slug = String((item as SportsMatchCardType).sport?.slug || "").toLowerCase();
      if (slug) slugsWithFixtures.add(slug);
    }
  }

  return sections.map((section) => {
    if (section.type !== "sports") return section;
    const items = (section.items as SportsWorldCardType[]).filter((sport) => {
      const slug = String(sport.slug || "").toLowerCase();
      if (!slug) return false;
      if (slug.includes("winter") || slug.includes("esport")) {
        return slugsWithFixtures.has(slug);
      }
      return slugsWithFixtures.has(slug) || Boolean(sport.liveCount) || Boolean(sport.upcomingCount);
    });
    return { ...section, items };
  });
}

function SportsHomeInner() {
  const gate = useSportsFullUiGate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SportsHomeSection[]>([]);
  const [devProfile, setDevProfile] = useState<DevProfile>("anonymous");
  const [sportFilter, setSportFilter] = useState<SportFilterId>("all");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [savedFixtureIds, setSavedFixtureIds] = useState<Set<string>>(new Set());
  const [followedCompetitionIds, setFollowedCompetitionIds] = useState<Set<string>>(new Set());

  const sportsTv = useSportsTvCatalog({ enabled: sportsTvEnabled });

  const countdownNeeded = useMemo(() => {
    for (const section of sections) {
      if (!Array.isArray(section.items)) continue;
      for (const item of section.items) {
        if (
          item &&
          typeof item === "object" &&
          "status" in item &&
          needsSportsCountdownClock(item as SportsMatchCardType)
        ) {
          return true;
        }
      }
    }
    return false;
  }, [sections]);
  const nowMs = useSportsNowClock(countdownNeeded ? 30_000 : 0);

  const abortRef = useRef<AbortController | null>(null);
  const watchGuardRef = useRef(createTapGuardState());
  const navGuardRef = useRef(createTapGuardState());
  const refreshInFlightRef = useRef(false);
  const focusedRef = useRef(false);
  const lastFetchedAtRef = useRef(0);
  const liveFixtureCountRef = useRef(0);
  const prefsLoadedRef = useRef(false);

  const applyHomeSections = useCallback((raw: SportsHomeSection[], sectionErrors?: { section: string; error: string }[]) => {
    const merged = mergeSectionErrors(raw, sectionErrors);
    setSections(
      omitEmptySportsSections(
        ensureLiveNowSection(filterUnsupportedHomeSections(merged))
      )
    );
  }, []);

  const load = useCallback(async (opts?: {
    background?: boolean;
    skipPrefs?: boolean;
    forceNetwork?: boolean;
  }) => {
    const background = opts?.background === true;
    const skipPrefs = opts?.skipPrefs === true || (background && prefsLoadedRef.current);
    const forceNetwork = opts?.forceNetwork === true || background;
    if (background && refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!background) setError(null);

    try {
      const homePromise = fetchSportsHome({
        signal: controller.signal,
        country: "ZZ",
        platform: Platform.OS,
        forceNetwork,
      });

      let home;
      if (skipPrefs) {
        home = await homePromise;
      } else {
        const [homeRes, reminders, favorites, follows] = await Promise.all([
          homePromise,
          getSportsReminders(),
          getSportsFavorites(),
          getSportsFollows(),
        ]);
        home = homeRes;
        if (controller.signal.aborted) return;
        setRemindedIds(new Set(reminders.map((r) => r.fixtureId)));
        setSavedFixtureIds(new Set(favorites.filter((f) => f.kind === "fixture").map((f) => f.id)));
        setFollowedCompetitionIds(
          new Set(follows.filter((f) => f.type === "competition").map((f) => f.id))
        );
        prefsLoadedRef.current = true;
      }
      if (controller.signal.aborted) return;

      lastFetchedAtRef.current = Date.now();

      if (!home.enabled) {
        // Keep prior sections if background refresh reports disabled briefly.
        if (!background) {
          setSections([]);
          setError(home.message || "Sports preview is unavailable.");
        }
        return;
      }

      const raw = Array.isArray(home.sections) ? home.sections : [];
      applyHomeSections(raw, home.sectionErrors);
    } catch {
      if (!controller.signal.aborted && !background) {
        setError("Sports could not be loaded. Try again.");
      }
    } finally {
      refreshInFlightRef.current = false;
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyHomeSections]);

  // Instant paint from browse cache — never blank while a fresh network load runs.
  useEffect(() => {
    if (!gate.allowed) return;
    const key = sportsHomeCacheKey("ZZ", Platform.OS, "public");
    // Private pilot mode key may differ; still try public hydrate first.
    const cached =
      getSportsBrowseCache<{
        enabled?: boolean;
        sections?: SportsHomeSection[];
        sectionErrors?: { section: string; error: string }[];
      }>(key) ||
      getSportsBrowseCache<{
        enabled?: boolean;
        sections?: SportsHomeSection[];
        sectionErrors?: { section: string; error: string }[];
      }>(sportsHomeCacheKey("ZZ", Platform.OS, "private-pilot"));
    if (cached?.enabled !== false && Array.isArray(cached?.sections) && cached.sections.length) {
      applyHomeSections(cached.sections, cached.sectionErrors);
      setLoading(false);
      lastFetchedAtRef.current = Date.now() - (isSportsBrowseCacheStale(key) ? SPORTS_HOME_STALE_MS : 0);
    }
    void load({
      forceNetwork: !cached || isSportsBrowseCacheStale(key),
      skipPrefs: false,
    });
    return () => {
      abortRef.current?.abort();
    };
  }, [gate.allowed, load, applyHomeSections]);

  // Capability-aware live refresh:
  // - no interval when live scores off or live count is 0
  // - pause in background
  // - AppState/focus refresh only after meaningful staleness
  // - Sports TV is never polled here
  useFocusEffect(
    useCallback(() => {
      if (!gate.allowed) return undefined;
      focusedRef.current = true;

      const age = Date.now() - lastFetchedAtRef.current;
      if (lastFetchedAtRef.current > 0 && age >= SPORTS_HOME_STALE_MS) {
        void load({ background: true, skipPrefs: true, forceNetwork: true });
      }

      const LIVE_REFRESH_MS = 45_000;
      const tick = () => {
        if (!focusedRef.current) return;
        if (AppState.currentState !== "active") return;
        if (!sportsLiveScoresEnabled) return;
        if (liveFixtureCountRef.current <= 0) return;
        void load({ background: true, skipPrefs: true, forceNetwork: true });
      };
      const intervalId = sportsLiveScoresEnabled
        ? setInterval(tick, LIVE_REFRESH_MS)
        : null;

      const onAppState = (state: AppStateStatus) => {
        if (state !== "active") return;
        if (!focusedRef.current) return;
        const staleAge = Date.now() - lastFetchedAtRef.current;
        if (staleAge < SPORTS_HOME_STALE_MS) return;
        void load({ background: true, skipPrefs: true, forceNetwork: true });
      };
      const sub = AppState.addEventListener("change", onAppState);
      return () => {
        focusedRef.current = false;
        if (intervalId) clearInterval(intervalId);
        sub.remove();
        abortRef.current?.abort();
      };
    }, [gate.allowed, load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ forceNetwork: true });
  }, [load]);

  const displaySections = useMemo(() => {
    const profiled = applyDevProfile(sections, devProfile);
    const filtered = filterSectionsBySport(profiled, sportFilter);
    return ensureLiveSportsTvSection(
      omitEmptySportsSections(filtered),
      sportsTvEnabled
    );
  }, [sections, devProfile, sportFilter]);
  const hero = useMemo(() => pickSportsHero(displaySections), [displaySections]);
  const nextUpcoming = useMemo(() => {
    const upcoming =
      displaySections.find((s) => s.id === "upcoming") ||
      displaySections.find((s) => s.id === "starting_soon");
    const items = Array.isArray(upcoming?.items)
      ? (upcoming.items as SportsMatchCardType[])
      : [];
    return items[0] || null;
  }, [displaySections]);
  const recentFinishedCount = useMemo(() => {
    const finished = displaySections.find((s) => s.id === "recently_finished");
    return Array.isArray(finished?.items) ? finished.items.length : 0;
  }, [displaySections]);
  const liveFixtureCount = useMemo(() => {
    const live = displaySections.find((s) => s.id === "live_now");
    return Array.isArray(live?.items) ? live.items.length : 0;
  }, [displaySections]);
  liveFixtureCountRef.current = liveFixtureCount;
  const hasPlayableSportsTv = sportsTv.videos.length > 0;

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

  const onPressMatch = useCallback(
    (card: SportsMatchCardType) => {
      if (shouldIgnoreDuplicateTap(navGuardRef.current, `fixture:${card.id}`)) return;
      goFixture(card.id);
    },
    [goFixture]
  );
  const onWatchMatch = useCallback((card: SportsMatchCardType) => {
    const action = getSportsWatchAction(card);
    if (action.kind === "watch_external" || action.kind === "subscription") {
      if (shouldIgnoreDuplicateTap(watchGuardRef.current, `ext:${card.id}`)) return;
      goFixture(card.id);
      return;
    }
    if (!shouldOpenSportsPlayer(card)) return;
    if (shouldIgnoreDuplicateTap(watchGuardRef.current, `watch:${card.id}`)) return;
    openSportsPlayerIfPlayable(card);
  }, [goFixture]);
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
    if (!c.code) return;
    router.push(`/sports/country/${encodeURIComponent(c.code)}` as any);
  }, []);
  const onPressVideo = useCallback(
    (v: SportsVideoCardType) => {
      if (v.fixtureId) goFixture(v.fixtureId);
    },
    [goFixture]
  );

  const listHeader = useMemo(
    () => (
      <>
        {error ? (
          <View style={styles.topError}>
            <Text style={styles.topErrorText}>{error}</Text>
            <Pressable onPress={() => { void load({ forceNetwork: true }); }} hitSlop={10}>
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

        <View style={styles.filterRow}>
          {SPORT_FILTERS.map((filter) => (
            <Pressable
              key={filter.id}
              onPress={() => setSportFilter(filter.id)}
              style={[
                styles.filterChip,
                sportFilter === filter.id ? styles.filterChipOn : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sportFilter === filter.id }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  sportFilter === filter.id ? styles.filterChipTextOn : null,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {hero ? (
          <View style={{ paddingHorizontal: 18, marginBottom: 22 }}>
            <SportsHero
              card={hero}
              nowMs={needsSportsCountdownClock(hero) ? nowMs : undefined}
              reminded={remindedIds.has(hero.id)}
              onPress={onPressMatch}
              onWatch={onWatchMatch}
              onRemind={onRemindMatch}
            />
          </View>
        ) : null}
      </>
    ),
    [
      error,
      load,
      devProfile,
      sportFilter,
      hero,
      nowMs,
      remindedIds,
      onPressMatch,
      onWatchMatch,
      onRemindMatch,
    ]
  );

  // Narrow TV shelf props so playback progress elsewhere cannot churn this list.
  const sportsTvShelfProps = useMemo(
    () => ({
      videos: sportsTv.videos,
      loading: sportsTv.loading,
      loadingMore: sportsTv.loadingMore,
      error: sportsTv.error,
      hasMore: sportsTv.hasMore,
      onLoadMore: sportsTv.loadMore,
      onRetry: sportsTv.refresh,
    }),
    [
      sportsTv.videos,
      sportsTv.loading,
      sportsTv.loadingMore,
      sportsTv.error,
      sportsTv.hasMore,
      sportsTv.loadMore,
      sportsTv.refresh,
    ]
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

      <SportsHeader
        onBackPress={navigateSportsHomeBack}
        onSearchPress={goSearch}
        onFollowingPress={goFollowing}
      />

      <View style={styles.savedLinkRow}>
        <Pressable style={styles.savedLinkBtn} onPress={goSaved} hitSlop={8}>
          <Ionicons name="bookmark-outline" size={14} color={SPORTS_COLORS.textMuted} />
          <Text style={styles.savedLinkText}>Saved</Text>
        </Pressable>
      </View>

      {showFullSkeleton ? (
        <View style={{ paddingTop: 8, paddingBottom: 40 }}>
          <View style={{ paddingHorizontal: 18, marginBottom: 22 }}>
            <SportsHeroSkeleton />
          </View>
          <SportsSkeletonRow render={() => <SportsMatchCardSkeleton />} count={3} />
        </View>
      ) : (
        <FlatList
          data={displaySections}
          keyExtractor={(section) => section.id}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !error ? (
              <View style={styles.center}>
                <Text style={styles.centerText}>
                  No Sports content is available right now. Pull to refresh.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item: section }) =>
            renderHomeSection(section, {
              nowMs,
              remindedIds,
              savedFixtureIds,
              followedCompetitionIds,
              nextUpcoming,
              recentFinishedCount,
              liveFixtureCount,
              hasPlayableSportsTv,
              sportsTv: sportsTvShelfProps,
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
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={SPORTS_COLORS.amber}
            />
          }
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === "android"}
        />
      )}
    </SafeAreaView>
  );
}

type HomeSectionHandlers = {
  nowMs: number;
  remindedIds: Set<string>;
  savedFixtureIds: Set<string>;
  followedCompetitionIds: Set<string>;
  nextUpcoming: SportsMatchCardType | null;
  recentFinishedCount: number;
  liveFixtureCount: number;
  hasPlayableSportsTv: boolean;
  sportsTv: {
    videos: ReturnType<typeof useSportsTvCatalog>["videos"];
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    onLoadMore: () => void;
    onRetry: () => void;
  };
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
  const itemLimit = sectionItemLimit(section.id);

  if (section.id === "live_sports_tv" || section.type === "tv_channels") {
    if (!sportsTvEnabled) return null;
    if (
      !h.sportsTv.loading &&
      !h.sportsTv.error &&
      !h.hasPlayableSportsTv &&
      h.liveFixtureCount === 0
    ) {
      return (
        <SportsSection title="Live Sports TV">
          <SportsEmptyState
            icon="tv-outline"
            title="No live matches or sports channels are available right now."
            message="Check upcoming fixtures below."
            compact
          />
        </SportsSection>
      );
    }
    if (!h.hasPlayableSportsTv && !h.sportsTv.loading && !h.sportsTv.error) {
      return null;
    }
    return (
      <SportsSection
        title={section.title || "Live Sports TV"}
        subtitle={section.subtitle}
      >
        <SportsTvShelf
          videos={h.sportsTv.videos}
          loading={h.sportsTv.loading}
          loadingMore={h.sportsTv.loadingMore}
          error={h.sportsTv.error}
          hasMore={h.sportsTv.hasMore}
          onLoadMore={h.sportsTv.onLoadMore}
          onRetry={h.sportsTv.onRetry}
        />
      </SportsSection>
    );
  }

  if (section.id === "todays_schedule" && section.type === "fixtures") {
    const matches = boundSectionItems(
      section.items as SportsMatchCardType[],
      itemLimit
    );
    return (
      <SportsSection
        title={section.title || "Today’s Fixtures"}
        subtitle={section.subtitle}
        error={section.error}
      >
        <SportsScheduleSection
          matches={matches}
          nowMs={h.nowMs}
          rowVariant="compact"
          onPressMatch={h.onPressMatch}
        />
      </SportsSection>
    );
  }

  if (section.type === "fixtures" || section.type === "live") {
    const variant = section.id === "recently_finished" ? "finished" : "shelf";
    const items = boundSectionItems(
      section.items as SportsMatchCardType[],
      itemLimit
    );
    if (section.id === "live_now" && items.length === 0) {
      const next = h.nextUpcoming;
      const nextTitle = next ? formatMatchTitle(next) : null;
      const nextWhen = next
        ? formatCountdown(next.timing?.startsAt, h.nowMs) ||
          formatKickoff(next.timing?.startsAt, h.nowMs)
        : null;
      const tvHint = sportsTvEnabled
        ? "Live sports channels are available below"
        : null;
      const messageParts = [
        tvHint,
        nextTitle && nextWhen
          ? `Next up: ${nextTitle} · ${nextWhen}`
          : nextTitle
            ? `Next up: ${nextTitle}`
            : null,
        !tvHint && h.recentFinishedCount > 0
          ? `${h.recentFinishedCount} recent results ready to browse.`
          : null,
      ].filter(Boolean);
      return (
        <SportsSection title={section.title || "Live Now"} error={section.error}>
          <SportsEmptyState
            icon="radio-outline"
            title="No confirmed live matches right now"
            message={messageParts.join(". ") || "Check upcoming fixtures below."}
            compact
            ctaLabel={next && !tvHint ? "View next match" : undefined}
            onCta={next && !tvHint ? () => h.onPressMatch(next) : undefined}
          />
        </SportsSection>
      );
    }
    return (
      <SportsSection title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsHorizontalShelf maxItems={itemLimit} columns="auto">
          {items.map((card) => (
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
    const items = boundSectionItems(
      (section.items as SportsCompetitionCardType[]).map((c) => ({
        ...c,
        followed: h.followedCompetitionIds.has(c.id),
      })),
      itemLimit
    );
    return (
      <SportsSection title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsCompetitionShelf
          sectionId={section.id}
          competitions={items}
          limit={itemLimit}
          onPress={h.onPressCompetition}
          onToggleFollow={h.onToggleFollowCompetition}
        />
      </SportsSection>
    );
  }

  if (section.type === "sports") {
    return (
      <SportsSection title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsWorldGrid
          sectionId={section.id}
          sports={boundSectionItems(
            section.items as SportsWorldCardType[],
            itemLimit
          )}
          onPress={h.onPressSport}
        />
      </SportsSection>
    );
  }

  if (section.type === "countries") {
    return (
      <SportsSection title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsCountryGrid
          countries={boundSectionItems(
            section.items as SportsCountryCardType[],
            itemLimit
          )}
          onPress={h.onPressCountry}
        />
      </SportsSection>
    );
  }

  if (section.type === "videos") {
    return (
      <SportsSection title={section.title} subtitle={section.subtitle} error={section.error}>
        <SportsHorizontalShelf columns={2} maxItems={itemLimit}>
          {boundSectionItems(section.items as SportsVideoCardType[], itemLimit).map((v) => (
            <SportsVideoCard key={v.id} video={v} onPress={h.onPressVideo} />
          ))}
        </SportsHorizontalShelf>
      </SportsSection>
    );
  }

  return null;
}

export default function SportsHomeScreen() {
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      markTvCloseDestinationRendered("/sports")
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return <SportsHomeInner />;
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
    backgroundColor: SPORTS_COLORS.surfaceGlass,
  },
  filterChipOn: {
    borderColor: SPORTS_COLORS.amber,
    backgroundColor: SPORTS_COLORS.amberSoft,
  },
  filterChipText: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextOn: {
    color: SPORTS_COLORS.amber,
  },
  center: { padding: 32, alignItems: "center" },
  centerText: { color: SPORTS_COLORS.textDim, fontSize: 13, textAlign: "center" },
});
