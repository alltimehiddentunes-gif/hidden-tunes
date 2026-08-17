import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  useWindowDimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";

import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { EmotionalDiscoveryChips } from "@/components/EmotionalDiscoveryChips";
import { HomeHeroCard, type HomeHeroCardData } from "@/components/home/HomeHeroCard";
import { usePlayerFeedSnapshot } from "@/utils/playerFeedStore";
import HTImage from "@/components/HTImage";
import { HomeCatalogSongRow, HomeFeaturedCard } from "@/components/catalog/HomePlaybackRows";
import { PremiumContentGrid } from "@/components/catalog/PremiumContentGrid";
import AppShell from "@/components/navigation/AppShell";
import {
  COLORS,
  GRADIENTS,
  LUXURY_GLOW,
  HOME_HEADER,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import {
  usePlayerActions,
} from "@/context/PlayerContext";
import type { PlaybackQueueContext } from "@/context/PlayerContext";
import {
  boundHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
  hydrateCachedHiddenTunesCatalog,
  HOME_BOUNDED_CATALOG_LIMIT,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "@/services/hiddenTunes";
import { getHiddenTunesSongsPage } from "@/services/hiddenTunesApi";
import {
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "@/services/hiddenTunesApi";
import type { HiddenTunesGenre } from "@/utils/genres";
import {
  FALLBACK_ARTWORK_ASSET,
  getArtworkUri,
  pickBestArtworkFromSongs,
  resolveGroupArtworkSource,
} from "@/utils/artwork";
import {
  getListPerformanceSettings,
  isAppActiveForWork,
  markFastScrolling,
  useAppActiveState,
} from "@/utils/performanceMode";
import { logPerformanceOffscreenWorkPaused } from "@/utils/performanceLogs";
import { navigateToRoute } from "@/utils/primaryNavigation";
import { openVideoItemWithAlert } from "@/services/videos/openVideoItem";
import PremiumEmptyState from "@/components/PremiumEmptyState";
import { HomeDiscoveryShortcut } from "@/components/home/HomeDiscoveryShortcut";
import GenreSpotlightCard from "@/components/home/GenreSpotlightCard";
import { getUserFacingArtist } from "@/services/ui/displayMetadata";
import { HOME_DISCOVERY_SHORTCUTS } from "@/constants/discoveryShortcuts";
import { useLocalization } from "@/localization";
import type { TranslationKey } from "@/localization";
import {
  getSharedDiscoverySnapshot,
  selectPersonalizedHomeOrdering,
  MAX_DISCOVERY_INPUT_SONGS,
} from "@/services/discoveryCache";
import {
  getDiscoveryPreferredGenres,
  getDiscoveryPreferenceSnapshot,
  hydrateDiscoveryPreferredGenres,
} from "@/utils/discoveryPreferences";
import {
  hydrateGenreSpotlightEngagement,
  recordGenreSpotlightOpen,
  recordMoodRoomGenreEngagement,
  getGenreSpotlightEngagementSnapshot,
} from "@/utils/genreSpotlightEngagement";
import {
  buildGenreSpotlightSignalHash,
  collectGenreWeightsFromSongs,
  emptyGenreSpotlightSignals,
  hasPersonalGenreSpotlightSignals,
  rankGenreSpotlights,
  resolveGenreSpotlightLimit,
  type GenreSpotlightSignals,
} from "@/utils/genreSpotlights";
import { listFreshCachedSearchQueries } from "@/utils/searchQueryCache";
import { TESTER_COPY } from "@/constants/testerExperience";

const CATALOG_PAGE_SIZE = 31;
const HOME_SCROLL_SETTLE_MS = 520;
const HOME_SECTION_PREVIEW_LIMIT = 8;
const HOME_FIRST_PAGE_LIMIT = 100;
const PERSONALIZED_HOME_RANKING_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_PERSONALIZED_HOME === "true";

function logHomeLoad(event: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return;
  console.log(`[HomeLoad] ${event}`, extra || "");
}

type CatalogGroup = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  songs: HiddenTunesSong[];
  type: "mood" | "genre";
};

function getArtwork(song?: HiddenTunesSong | null) {
  return getArtworkUri(song);
}

/** Stable local cover when catalogue URLs are missing/failed — keyed by room id. */
const MOOD_ROOM_LOCAL_FALLBACKS: Record<string, number> = {
  healing: require("../assets/images/cover1.jpg"),
  "late-night": require("../assets/images/cover2.jpg"),
  calm: require("../assets/images/cover3.jpg"),
  energy: require("../assets/images/cover1.jpg"),
  "calm-instrumentals": require("../assets/images/cover3.jpg"),
  "night-drive": require("../assets/images/cover2.jpg"),
  "worship-focus": require("../assets/images/cover1.jpg"),
  "healing-room": require("../assets/images/cover1.jpg"),
};

function moodRoomFallbackArtwork(roomId: string) {
  return MOOD_ROOM_LOCAL_FALLBACKS[roomId] || FALLBACK_ARTWORK_ASSET;
}

function songText(song: HiddenTunesSong) {
  return [song.title, song.artist, song.album, song.genre, song.mood]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqSongs(songs: HiddenTunesSong[]) {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const id = String(song.id || `${song.artist}-${song.title}`);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildSongListSignature(songs: Array<{ id?: unknown; artist?: unknown }>) {
  if (!songs.length) return "empty";
  const first = songs[0];
  const middle = songs[Math.floor(songs.length / 2)];
  const last = songs[songs.length - 1];
  return [
    songs.length,
    first?.id || first?.artist || "",
    middle?.id || middle?.artist || "",
    last?.id || last?.artist || "",
  ].join(":");
}

function buildMatchedGroup(
  id: string,
  title: string,
  terms: string[],
  songs: HiddenTunesSong[],
  type: "mood" | "genre" = "mood"
): CatalogGroup | null {
  const matches = songs.filter((song) => {
    const text = songText(song);
    return terms.some((term) => text.includes(term.toLowerCase()));
  });
  const groupSongs = uniqSongs(matches).slice(0, 18);
  if (!groupSongs.length) return null;
  // Deterministic: first valid song artwork in room order (not random, not first-only blind).
  const artwork = pickBestArtworkFromSongs(groupSongs) || getArtwork(groupSongs[0]);
  return {
    id,
    title,
    subtitle: `${groupSongs.length} song${groupSongs.length === 1 ? "" : "s"}`,
    artwork,
    songs: groupSongs,
    type,
  };
}

function buildMoodRooms(songs: HiddenTunesSong[]) {
  return [
    buildMatchedGroup("healing", "Healing", ["healing", "heal", "restore", "worship", "prayer", "peace"], songs),
    buildMatchedGroup("late-night", "Late Night", ["late", "night", "midnight", "after dark", "drive"], songs),
    buildMatchedGroup("calm", "Calm", ["calm", "soft", "peace", "ambient", "quiet", "instrumental"], songs),
    buildMatchedGroup("energy", "Energy", ["energy", "dance", "party", "afro", "beat", "upbeat"], songs),
  ].filter(Boolean) as CatalogGroup[];
}

function buildOpenRooms(songs: HiddenTunesSong[]) {
  return [
    buildMatchedGroup("calm-instrumentals", "Calm Instrumentals", ["instrumental", "calm", "ambient"], songs),
    buildMatchedGroup("night-drive", "Night Drive", ["night", "drive", "late", "midnight"], songs),
    buildMatchedGroup("worship-focus", "Worship Focus", ["worship", "gospel", "prayer", "jesus", "praise"], songs),
    buildMatchedGroup("healing-room", "Healing Room", ["healing", "heal", "restore", "peace"], songs),
  ].filter(Boolean) as CatalogGroup[];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const HOME_CONTINUOUS_MOTION_ENABLED = false;
const HOME_HERO_AUTO_SLIDE_ENABLED = false;

function getInitialHomeCatalog() {
  return boundHiddenTunesCatalog(
    getCachedHiddenTunesCatalog(),
    HOME_BOUNDED_CATALOG_LIMIT
  );
}

const PremiumAmbientGlow = memo(function PremiumAmbientGlow({
  style,
  color,
  paused = false,
}: {
  style: object;
  color: string;
  paused?: boolean;
}) {
  const appActive = useAppActiveState();
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);

  useEffect(() => {
    if (!HOME_CONTINUOUS_MOTION_ENABLED || !appActive || paused) {
      cancelAnimation(opacity);
      opacity.value = withTiming(LUXURY_GLOW.opacityMin, { duration: 220 });
      return;
    }

    opacity.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.opacityMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.opacityMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => cancelAnimation(opacity);
  }, [appActive, opacity, paused]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, { backgroundColor: color }, animatedStyle]}
    />
  );
});

const PremiumLuxuryPulse = memo(function PremiumLuxuryPulse({
  style,
  paused = false,
}: {
  style?: object;
  paused?: boolean;
}) {
  const appActive = useAppActiveState();
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const scale = useSharedValue<number>(LUXURY_GLOW.scaleMin);

  useEffect(() => {
    if (!HOME_CONTINUOUS_MOTION_ENABLED || !appActive || paused) {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      opacity.value = withTiming(LUXURY_GLOW.opacityMin, { duration: 220 });
      scale.value = withTiming(LUXURY_GLOW.scaleMin, { duration: 220 });
      return;
    }

    opacity.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.opacityMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.opacityMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.scaleMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.scaleMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [appActive, opacity, paused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[style, animatedStyle]}>
      <LinearGradient colors={GRADIENTS.heroAura} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
});


const CreatorRailCard = memo(function CreatorRailCard({
  artist,
  width = "100%",
  onPress,
  animationsPaused = false,
  songCountLabel,
}: {
  artist: HiddenTunesArtistCatalogItem;
  width?: number | "100%";
  onPress: () => void;
  animationsPaused?: boolean;
  songCountLabel: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.creatorCard, { width }]}
      onPress={onPress}
    >
      <View style={styles.creatorArtWrap}>
        <PremiumLuxuryPulse style={styles.creatorArtAura} paused={animationsPaused} />
        <HTImage
          source={artist}
          style={styles.creatorArt}
          contentFit="cover"
          contentPosition="center"
        />
      </View>
      <Text numberOfLines={2} ellipsizeMode="tail" style={styles.creatorName}>
        {artist.name}
      </Text>
      <Text numberOfLines={1} style={styles.creatorMeta}>
        {songCountLabel}
      </Text>
    </TouchableOpacity>
  );
});

const AlbumRailCard = memo(function AlbumRailCard({
  album,
  width = "100%",
  onPress,
  animationsPaused = false,
}: {
  album: HiddenTunesAlbumCatalogItem;
  width?: number | "100%";
  onPress: () => void;
  animationsPaused?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.albumRailCard, { width }]}
      onPress={onPress}
    >
      <View style={styles.albumArtWrap}>
        <PremiumLuxuryPulse style={styles.albumArtAura} paused={animationsPaused} />
        <HTImage
          source={album}
          style={styles.albumArt}
          contentFit="cover"
          contentPosition="center"
        />
      </View>
      <Text numberOfLines={2} ellipsizeMode="tail" style={styles.albumTitle}>
        {album.title}
      </Text>
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.albumArtist}>
        {album.artist}
      </Text>
    </TouchableOpacity>
  );
});
const PremiumHeroPressable = memo(function PremiumHeroPressable({
  children,
  height,
  isActive,
  animationsPaused = false,
  onPress,
}: {
  children: ReactNode;
  height: number;
  isActive: boolean;
  animationsPaused?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue<number>(LUXURY_GLOW.opacityMin);

  useEffect(() => {
    cancelAnimation(glow);
    if (!HOME_CONTINUOUS_MOTION_ENABLED || animationsPaused) {
      glow.value = withTiming(LUXURY_GLOW.opacityMin, { duration: 220 });
      return;
    }

    const peak = isActive ? LUXURY_GLOW.opacityMax + 0.06 : LUXURY_GLOW.opacityMax;
    const floor = isActive ? LUXURY_GLOW.opacityMin + 0.04 : LUXURY_GLOW.opacityMin;

    glow.value = withRepeat(
      withSequence(
        withTiming(peak, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(floor, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => cancelAnimation(glow);
  }, [animationsPaused, glow, isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.982, { damping: 18, stiffness: 360 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 16, stiffness: 320 });
  }, [scale]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.heroCard, { height }, animatedStyle]}
    >
      <Animated.View style={[styles.heroActiveGlow, glowStyle]} pointerEvents="none" />
      {children}
    </AnimatedPressable>
  );
});

const HomeHeroCarousel = memo(function HomeHeroCarousel({
  cards,
  heroCardWidth,
  heroCardHeight,
  heroActionLabels,
  onPress,
  animationsPaused,
  focused,
}: {
  cards: HeroCard[];
  heroCardWidth: number;
  heroCardHeight: number;
  heroActionLabels: {
    nowPlayingActive: string;
    openPlayer: string;
    play: string;
  };
  onPress: (card: HeroCard) => void;
  animationsPaused: boolean;
  focused: boolean;
}) {
  const [heroIndex, setHeroIndex] = useState(0);
  const heroListRef = useRef<FlatList<HeroCard> | null>(null);

  useEffect(() => {
    if (!HOME_HERO_AUTO_SLIDE_ENABLED || cards.length <= 1) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setInterval(() => {
        if (!isAppActiveForWork() || !focused || animationsPaused) return;
        setHeroIndex((current) => {
          const next = (current + 1) % cards.length;
          heroListRef.current?.scrollToIndex({ index: next, animated: true });
          return next;
        });
      }, 6500);
    });

    return () => {
      interaction.cancel();
      if (timer) clearInterval(timer);
    };
  }, [animationsPaused, cards.length, focused]);

  const handleHeroMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offset = event.nativeEvent.contentOffset.x || 0;
      const nextIndex = Math.max(
        0,
        Math.min(cards.length - 1, Math.round(offset / heroCardWidth))
      );
      setHeroIndex(nextIndex);
    },
    [cards.length, heroCardWidth]
  );

  const handleHeroPress = useCallback(
    (card: HeroCard) => {
      onPress(card);
    },
    [onPress]
  );

  const HeroPressable = useCallback(
    ({
      children,
      height,
      isActive,
      onPress,
    }: {
      children: ReactNode;
      height: number;
      isActive: boolean;
      onPress: () => void;
    }) => (
      <PremiumHeroPressable
        height={height}
        isActive={isActive}
        animationsPaused={animationsPaused}
        onPress={onPress}
      >
        {children}
      </PremiumHeroPressable>
    ),
    [animationsPaused]
  );

  const HeroLuxuryPulse = useCallback(
    ({ style }: { style: object }) => (
      <PremiumLuxuryPulse style={style} paused={animationsPaused} />
    ),
    [animationsPaused]
  );

  const renderHeroCard = useCallback(
    ({ item, index }: { item: HeroCard; index: number }) => (
      <HomeHeroCard
        item={item}
        index={index}
        heroCardWidth={heroCardWidth}
        heroCardHeight={heroCardHeight}
        totalCards={cards.length}
        activeSlideIndex={heroIndex}
        heroActionLabels={heroActionLabels}
        onPress={handleHeroPress}
        HeroPressable={HeroPressable}
        LuxuryPulse={HeroLuxuryPulse}
        styles={styles}
      />
    ),
    [
      HeroLuxuryPulse,
      HeroPressable,
      cards.length,
      handleHeroPress,
      heroActionLabels,
      heroCardHeight,
      heroCardWidth,
      heroIndex,
    ]
  );

  if (!cards.length) return null;

  return (
    <View style={styles.heroStage}>
      <PremiumLuxuryPulse style={styles.heroStageGlow} paused={animationsPaused} />
      <FlatList
        ref={heroListRef}
        horizontal
        data={cards}
        keyExtractor={(item) => item.key}
        renderItem={renderHeroCard}
        showsHorizontalScrollIndicator={false}
        snapToInterval={heroCardWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={handleHeroMomentumEnd}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={styles.heroList}
      />

      {cards.length > 1 ? (
        <View style={styles.heroDots}>
          {cards.map((card, index) => (
            <View
              key={card.key}
              style={[styles.heroDot, index === heroIndex && styles.heroDotActive]}
            >
              {index === heroIndex ? (
                <PremiumLuxuryPulse style={styles.heroDotGlow} paused={animationsPaused} />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

type HeroCard = HomeHeroCardData;

const HOME_SHORTCUT_KEYS: Record<string, TranslationKey> = {
  "home-radio": "home.shortcuts.radio",
  "home-podcasts": "home.shortcuts.podcasts",
  "home-audiobooks": "home.shortcuts.audiobooks",
  "home-more": "home.shortcuts.more",
};

const ROOM_DISPLAY_KEYS: Record<string, TranslationKey> = {
  healing: "home.rooms.healing",
  "late-night": "home.rooms.lateNight",
  calm: "home.rooms.calm",
  energy: "home.rooms.energy",
  "calm-instrumentals": "home.rooms.calmInstrumentals",
  "night-drive": "home.rooms.nightDrive",
  "worship-focus": "home.rooms.worshipFocus",
  "healing-room": "home.rooms.healingRoom",
};

type HeroCardLabels = {
  nowPlaying: string;
  featured: string;
  pick: string;
  recentlyPlayed: string;
  nowPlayingFallback: string;
  editorPick: string;
  genreSpotlight: string;
  inRotation: string;
};

function buildHeroCards(
  songs: HiddenTunesSong[],
  featuredSongs: HiddenTunesSong[],
  currentSong: { id?: string; title?: string; artist?: string } | null,
  recentlyPlayed: Array<{ id?: string; title?: string; artist?: string }>,
  labels: HeroCardLabels
): HeroCard[] {
  const cards: HeroCard[] = [];
  const primary = featuredSongs[0] || songs[0];
  const pick = featuredSongs[1] || featuredSongs[0];
  const genreSong = featuredSongs.find((song) => song.genre) || songs.find((song) => song.genre);
  const recent = recentlyPlayed[0];

  if (currentSong && primary) {
    const match =
      songs.find((song) => String(song.id) === String(currentSong.id)) ||
      (primary as HiddenTunesSong);

    cards.push({
      key: `current-${match.id}`,
      label: labels.nowPlaying,
      title: currentSong.title || match.title || labels.nowPlayingFallback,
      subtitle:
        getUserFacingArtist(currentSong) ||
        getUserFacingArtist(match) ||
        "Hidden Tunes",
      song: match as unknown as HiddenTunesNormalizedSong,
      icon: "pulse",
      isCurrent: true,
    });
  }

  if (primary) {
    cards.push({
      key: `featured-${primary.id}`,
      label: labels.featured,
      title: primary.title,
      subtitle: getUserFacingArtist(primary) || "Hidden Tunes",
      song: primary as unknown as HiddenTunesNormalizedSong,
      icon: "sparkles",
    });
  }

  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: labels.pick,
      title: pick.title,
      subtitle: getUserFacingArtist(pick) || labels.editorPick,
      song: pick as unknown as HiddenTunesNormalizedSong,
      icon: "cloud-done",
    });
  }

  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || "GENRE").toUpperCase(),
      title: genreSong.title,
      subtitle: getUserFacingArtist(genreSong) || labels.genreSpotlight,
      song: genreSong as unknown as HiddenTunesNormalizedSong,
      icon: "albums",
    });
  }

  if (recent) {
    const recentSong =
      songs.find((song) => String(song.id) === String(recent.id)) || primary;

    if (recentSong) {
      cards.push({
        key: `recent-${recentSong.id}`,
        label: labels.recentlyPlayed,
        title: recent.title || recentSong.title,
        subtitle:
          getUserFacingArtist(recent) ||
          getUserFacingArtist(recentSong) ||
          labels.inRotation,
        song: recentSong as unknown as HiddenTunesNormalizedSong,
        icon: "time",
      });
    }
  }

  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.key)) return false;
    seen.add(card.key);
    return true;
  }).slice(0, 6);
}

function findSongIndex(songs: HiddenTunesSong[], song: { id?: string }) {
  const id = String(song?.id || "");
  return songs.findIndex((candidate) => String(candidate.id) === id);
}

type HomeCatalogStatus = "loading" | "cached" | "fresh" | "empty" | "error";

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const playerFeed = usePlayerFeedSnapshot();
  const { t } = useLocalization();

  const homeUi = useMemo(
    () => ({
      loadingMusic: t("home.loadingMusic"),
      searchLauncher: t("home.searchLauncher"),
      loadMore: t("home.loadMore"),
      emptyTitle: t("home.emptyTitle"),
      emptyCatalogMessage: t("home.emptyCatalogMessage"),
      refreshCatalog: t("home.refreshCatalog"),
      emotionalWorldsTitle: t("home.emotionalWorlds.title"),
      emotionalWorldsSubtitle: t("home.emotionalWorlds.subtitle"),
      heroLabels: {
        nowPlaying: t("home.hero.nowPlaying"),
        featured: t("home.hero.featured"),
        pick: t("home.hero.pick"),
        recentlyPlayed: t("home.hero.recentlyPlayed"),
        nowPlayingFallback: t("home.hero.nowPlayingFallback"),
        editorPick: t("home.hero.editorPick"),
        genreSpotlight: t("home.hero.genreSpotlight"),
        inRotation: t("home.hero.inRotation"),
      },
      heroActions: {
        nowPlayingActive: t("home.hero.nowPlayingActive"),
        openPlayer: t("home.hero.openPlayer"),
        play: t("home.hero.play"),
      },
      listening: {
        nowPlaying: t("home.listening.nowPlaying"),
        nothingPlaying: t("home.listening.nothingPlaying"),
        tapToStart: t("home.listening.tapToStart"),
      },
      signals: {
        curatedRooms: t("home.signals.curatedRooms"),
        songsReady: (count: string) => t("home.signals.songsReady", { count }),
      },
      sections: {
        forYourMood: t("home.sections.forYourMood"),
        moodRooms: t("home.sections.moodRooms"),
        new: t("home.sections.new"),
        recentlyAdded: t("home.sections.recentlyAdded"),
        play: t("home.sections.play"),
        listener: t("home.sections.listener"),
        becauseYouListened: t("home.sections.becauseYouListened"),
        next: t("home.sections.next"),
        smartMusicQueue: t("home.sections.smartMusicQueue"),
        creators: t("home.sections.creators"),
        creatorsInOrbit: t("home.sections.creatorsInOrbit"),
        collections: t("home.sections.collections"),
        albumsWorthStaying: t("home.sections.albumsWorthStaying"),
        rooms: t("home.sections.rooms"),
        openRooms: t("home.sections.openRooms"),
        genres: t("home.sections.genres"),
        moodGenreSpotlights: t("home.sections.moodGenreSpotlights"),
        madeForYou: t("music.playlist.madeForYou"),
        fullCatalog: t("home.sections.fullCatalog"),
        allSongs: t("home.sections.allSongs"),
      },
      recentlyAddedEmpty: t("home.recentlyAddedEmpty"),
      queueLabels: {
        fullCatalog: t("home.queueLabels.fullCatalog"),
        recentlyAdded: t("home.queueLabels.recentlyAdded"),
        becauseYouListened: t("home.queueLabels.becauseYouListened"),
        smartMusicQueue: t("home.queueLabels.smartMusicQueue"),
      },
      formatSongCount: (count: number) => t("home.songCount", { count }),
      roomTitle: (roomId: string, fallback: string) => {
        const key = ROOM_DISPLAY_KEYS[roomId];
        return key ? t(key) : fallback;
      },
      shortcutTitle: (shortcutKey: string, fallback: string) => {
        const key = HOME_SHORTCUT_KEYS[shortcutKey];
        return key ? t(key) : fallback;
      },
      shortcutAccessibility: (title: string) =>
        t("home.accessibility.openShortcut", { title }),
    }),
    [t]
  );

  const homeUiRef = useRef(homeUi);
  homeUiRef.current = homeUi;
  const initialCatalogStateRef = useRef<HiddenTunesDerivedCatalog | null | undefined>(undefined);
  if (initialCatalogStateRef.current === undefined) {
    initialCatalogStateRef.current = getInitialHomeCatalog();
  }

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(
    () => initialCatalogStateRef.current || null
  );
  const [loading, setLoading] = useState(() => !initialCatalogStateRef.current);
  const [catalogStatus, setCatalogStatus] = useState<HomeCatalogStatus>(() =>
    catalog?.songs.length ? "cached" : "loading"
  );
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(CATALOG_PAGE_SIZE);
  const [homePreferences, setHomePreferences] = useState(() =>
    getDiscoveryPreferenceSnapshot()
  );
  const [showDeferredHomeSections, setShowDeferredHomeSections] = useState(false);
  const [genreSpotlightSignals, setGenreSpotlightSignals] = useState<GenreSpotlightSignals>(
    emptyGenreSpotlightSignals
  );
  const genreSpotlightSignalHashRef = useRef("");
  const [homeLogoFailed, setHomeLogoFailed] = useState(false);
  const [homeAnimationsPaused, setHomeAnimationsPaused] = useState(false);
  const [homeFocused, setHomeFocused] = useState(true);
  const mountedRef = useRef(true);
  const focusedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const loadedHomeOnceRef = useRef(Boolean(initialCatalogStateRef.current));
  const hasUsableCatalogRef = useRef(Boolean(catalog?.songs.length));
  const catalogRequestRef = useRef<Promise<void> | null>(null);
  const homeMountAtRef = useRef(Date.now());
  const homeShellLoggedRef = useRef(false);
  const homeVerticalScrollingRef = useRef(false);
  const homeScrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width: viewportWidth } = useWindowDimensions();
  const heroCardWidth = Math.min(540, Math.max(320, viewportWidth - 36));
  const heroCardHeight = Math.min(430, Math.max(340, Math.round(heroCardWidth * 0.92)));
  const searchPanelPadding = viewportWidth < 380 ? 10 : 12;

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];
  // Never block the Home shell behind a full-screen loader. Header, search,
  // tabs, and cached/skeleton content must paint immediately.
  const showInlineCatalogLoading = loading && songs.length === 0;
  const homeMotionPaused =
    homeAnimationsPaused || !homeFocused || !HOME_CONTINUOUS_MOTION_ENABLED;

  if (!homeShellLoggedRef.current) {
    homeShellLoggedRef.current = true;
    logHomeLoad("shell_render", {
      ms: Date.now() - homeMountAtRef.current,
      hasCachedCatalog: Boolean(initialCatalogStateRef.current),
      cachedSongs: initialCatalogStateRef.current?.songs.length || 0,
    });
  }

  const applyCatalog = useCallback((
    data: HiddenTunesDerivedCatalog | null | undefined,
    generation: number
  ) => {
    if (
      !data?.songs.length ||
      !mountedRef.current ||
      !focusedRef.current ||
      generation !== loadGenerationRef.current
    ) {
      return;
    }
    setCatalog(data);
    setLoading(false);
    loadedHomeOnceRef.current = true;
    hasUsableCatalogRef.current = true;
  }, []);

  const loadCatalog = useCallback(async () => {
    if (catalogRequestRef.current) {
      logHomeLoad("deduped_inflight_request");
      return catalogRequestRef.current;
    }

    void hydrateDiscoveryPreferredGenres().then(() => {
      if (mountedRef.current) setHomePreferences(getDiscoveryPreferenceSnapshot());
    });

    const request = (async () => {
      const startedAt = Date.now();
      const generation = ++loadGenerationRef.current;
      try {
        // 1) Disk cache first — paint immediately when anything is available.
        const hydratedStarted = Date.now();
        const hydrated = await hydrateCachedHiddenTunesCatalog();
        logHomeLoad("disk_hydrate", {
          ms: Date.now() - hydratedStarted,
          songs: hydrated?.songs.length || 0,
        });
        if (hydrated) {
          const boundedHydrated = boundHiddenTunesCatalog(
            hydrated,
            HOME_BOUNDED_CATALOG_LIMIT
          );
          applyCatalog(boundedHydrated, generation);
          setCatalogStatus("cached");
          logHomeLoad("cached_content", {
            ms: Date.now() - homeMountAtRef.current,
            songs: boundedHydrated?.songs.length || 0,
          });
        }

        // 2) Refresh Home from only the first catalog page. This screen must
        // never start a complete catalog walk.
        const networkStarted = Date.now();
        try {
          const pageResult = await getHiddenTunesSongsPage({
            page: 1,
            limit: HOME_FIRST_PAGE_LIMIT,
          });
          const firstPageCatalog = boundHiddenTunesCatalog(
            getCachedHiddenTunesCatalog(),
            HOME_BOUNDED_CATALOG_LIMIT
          );
          if (firstPageCatalog?.songs.length) {
            applyCatalog(firstPageCatalog, generation);
            setCatalogStatus(
              pageResult.source === "network" ? "fresh" : "cached"
            );
            logHomeLoad("first_page", {
              ms: Date.now() - networkStarted,
              songs: firstPageCatalog.songs.length,
            });
          }
          if (!hasUsableCatalogRef.current) {
            if (pageResult.authoritativeEmpty) setCatalogStatus("empty");
            else if (pageResult.errorCode) setCatalogStatus("error");
          }
        } catch (error) {
          if (!hasUsableCatalogRef.current) setCatalogStatus("error");
          logHomeLoad("first_page_error", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } catch (error) {
        logHomeLoad("load_error", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        catalogRequestRef.current = null;
        if (
          mountedRef.current &&
          focusedRef.current &&
          generation === loadGenerationRef.current
        ) {
          setLoading(false);
        }
        logHomeLoad("load_finally", {
          ms: Date.now() - startedAt,
          sinceMountMs: Date.now() - homeMountAtRef.current,
        });
      }
    })();

    catalogRequestRef.current = request;
    return request;
  }, [applyCatalog]);

  useEffect(() => {
    mountedRef.current = true;
    // Start immediately — do not wait for InteractionManager (that delayed first paint).
    void loadCatalog();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCatalog]);


  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    const startedAt = Date.now();
    const generation = ++loadGenerationRef.current;
    try {
      const pageResult = await getHiddenTunesSongsPage({
        page: 1,
        limit: HOME_FIRST_PAGE_LIMIT,
        forceRefresh: true,
      });
      const data = boundHiddenTunesCatalog(
        getCachedHiddenTunesCatalog(),
        HOME_BOUNDED_CATALOG_LIMIT
      );
      if (
        data?.songs.length &&
        mountedRef.current &&
        focusedRef.current &&
        generation === loadGenerationRef.current
      ) {
        setCatalog(data);
        hasUsableCatalogRef.current = true;
        setCatalogStatus(
          pageResult.source === "network" ? "fresh" : "cached"
        );
      } else if (!hasUsableCatalogRef.current) {
        if (pageResult.authoritativeEmpty) setCatalogStatus("empty");
        else if (pageResult.errorCode) setCatalogStatus("error");
      }
      setVisibleCatalogCount(CATALOG_PAGE_SIZE);
      logHomeLoad("pull_refresh", {
        ms: Date.now() - startedAt,
        songs: data?.songs.length || 0,
      });
    } catch (error) {
      if (!hasUsableCatalogRef.current) setCatalogStatus("error");
      logHomeLoad("pull_refresh_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const songsSignature = useMemo(() => buildSongListSignature(songs), [songs]);
  const recentArtistSignature = playerFeed.recentArtistSignature;
  const favoriteArtistSignature = playerFeed.favoriteArtistSignature;
  const activeQueueSignature = playerFeed.activeQueueSignature;

  const visiblePlaylists = useMemo(() => playlists.slice(0, 6), [playlists]);
  const discoveryInputSongs = useMemo(
    () => songs.slice(0, MAX_DISCOVERY_INPUT_SONGS) as HiddenTunesNormalizedSong[],
    [songsSignature]
  );
  const sharedDiscovery = useMemo(
    () =>
      getSharedDiscoverySnapshot({
        songs: discoveryInputSongs,
        recentlyPlayed: (playerFeed.recentlyPlayed || []) as HiddenTunesNormalizedSong[],
        favorites: (playerFeed.favorites || []) as HiddenTunesNormalizedSong[],
        onboardingGenres: homePreferences.genres,
        onboardingMoods: homePreferences.moods,
        discoveryStyle: homePreferences.discoveryStyle,
        personalizedHomeEnabled: PERSONALIZED_HOME_RANKING_ENABLED,
      }),
    [
      discoveryInputSongs,
      playerFeed.favorites,
      playerFeed.recentlyPlayed,
      homePreferences,
      songsSignature,
    ]
  );
  const personalizedHomeSongs = useMemo(
    () =>
      selectPersonalizedHomeOrdering(
        PERSONALIZED_HOME_RANKING_ENABLED,
        songs as HiddenTunesNormalizedSong[],
        sharedDiscovery.personalizedHomeSongs
      ) as HiddenTunesSong[],
    [sharedDiscovery.personalizedHomeSongs, songsSignature]
  );
  const homeFeaturedSongs = useMemo(
    () => personalizedHomeSongs.slice(0, 8),
    [personalizedHomeSongs]
  );
  const recentlyAddedSongs = useMemo(
    () =>
      showDeferredHomeSections
        ? PERSONALIZED_HOME_RANKING_ENABLED
          ? sharedDiscovery.relevantNewReleases
          : sharedDiscovery.recentlyDiscovered
        : [],
    [sharedDiscovery.recentlyDiscovered, sharedDiscovery.relevantNewReleases, showDeferredHomeSections]
  );
  const moodRooms = useMemo(
    () => (showDeferredHomeSections ? buildMoodRooms(songs) : []),
    [showDeferredHomeSections, songsSignature]
  );
  const openRooms = useMemo(
    () => (showDeferredHomeSections ? buildOpenRooms(songs) : []),
    [showDeferredHomeSections, songsSignature]
  );
  const visibleArtists = useMemo(
    () => (showDeferredHomeSections ? artists.slice(0, HOME_SECTION_PREVIEW_LIMIT) : []),
    [artists, showDeferredHomeSections]
  );
  const visibleAlbums = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    return albums.slice(0, HOME_SECTION_PREVIEW_LIMIT);
  }, [albums, showDeferredHomeSections]);
  const genreSignature = useMemo(() => buildSongListSignature(genres), [genres]);
  const catalogGenreById = useMemo(() => {
    const map = new Map<string, { genre?: unknown }>();
    for (const song of songs) {
      const id = String(song.id || "").trim();
      if (!id) continue;
      map.set(id, { genre: song.genre });
    }
    return map;
  }, [songsSignature]);

  const refreshGenreSpotlightSignals = useCallback(async () => {
    await Promise.all([
      hydrateDiscoveryPreferredGenres(),
      hydrateGenreSpotlightEngagement(),
    ]);

    const engagement = getGenreSpotlightEngagementSnapshot();
    const recentItems = Array.isArray(playerFeed.recentlyPlayed)
      ? (playerFeed.recentlyPlayed as Array<{
          id?: unknown;
          genre?: unknown;
          playCount?: unknown;
        }>)
      : [];
    const favoriteItems = Array.isArray(playerFeed.favorites)
      ? (playerFeed.favorites as Array<{
          id?: unknown;
          type?: unknown;
          metadata?: { genre?: unknown };
          genre?: unknown;
        }>)
          .filter((item) => !item.type || item.type === "song")
          .map((item) => ({
            id: item.id,
            genre: item.genre || item.metadata?.genre,
          }))
      : [];

    const next: GenreSpotlightSignals = {
      onboardingGenres: getDiscoveryPreferredGenres(),
      recentPlayGenres: collectGenreWeightsFromSongs(recentItems, catalogGenreById),
      favoriteGenres: collectGenreWeightsFromSongs(favoriteItems, catalogGenreById),
      searchQueries: listFreshCachedSearchQueries(24),
      openedGenres: engagement.openedGenres.map((item) => ({
        genre: item.genre,
        openedAt: item.openedAt,
      })),
      moodEngagementGenres: engagement.moodEngagementGenres.map((item) => ({
        genre: item.genre,
        weight: item.weight,
      })),
    };

    const hash = buildGenreSpotlightSignalHash(next);
    if (hash === genreSpotlightSignalHashRef.current) return;
    genreSpotlightSignalHashRef.current = hash;
    setGenreSpotlightSignals(next);
  }, [catalogGenreById, playerFeed.favorites, playerFeed.recentlyPlayed]);

  useEffect(() => {
    void refreshGenreSpotlightSignals();
  }, [refreshGenreSpotlightSignals, showDeferredHomeSections]);

  const genreSpotlightLimit = useMemo(
    () => resolveGenreSpotlightLimit(viewportWidth),
    [viewportWidth]
  );

  const visibleGenres = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    return rankGenreSpotlights(genres, genreSpotlightSignals, genreSpotlightLimit);
  }, [
    genreSignature,
    genreSpotlightLimit,
    genreSpotlightSignals,
    showDeferredHomeSections,
  ]);

  const genreSpotlightsPersonalized = useMemo(
    () => hasPersonalGenreSpotlightSignals(genreSpotlightSignals),
    [genreSpotlightSignals]
  );
  const visibleCatalogSongs = useMemo(
    () => personalizedHomeSongs.slice(0, visibleCatalogCount),
    [personalizedHomeSongs, visibleCatalogCount]
  );
  const canLoadMore = visibleCatalogCount < songs.length;
  const catalogListPerf = useMemo(
    () => getListPerformanceSettings(visibleCatalogSongs.length),
    [visibleCatalogSongs.length]
  );

  const becauseYouListened = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    const recentArtists = new Set(recentArtistSignature.split("|").filter(Boolean));
    const favoriteArtists = new Set(favoriteArtistSignature.split("|").filter(Boolean));
    const candidates = songs.filter((song) => {
      const artist = String(song.artist || "").toLowerCase();
      return recentArtists.has(artist) || favoriteArtists.has(artist);
    });
    return uniqSongs(candidates.length ? candidates : songs.slice(8, 24)).slice(
      0,
      HOME_SECTION_PREVIEW_LIMIT
    );
  }, [favoriteArtistSignature, recentArtistSignature, showDeferredHomeSections, songsSignature]);

  const smartQueueSongs = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    const queueSongs = Array.isArray(playerFeed.activeQueue)
      ? (playerFeed.activeQueue as HiddenTunesSong[])
      : [];
    return uniqSongs((queueSongs.length ? queueSongs : songs.slice(12, 30)).filter(Boolean)).slice(
      0,
      HOME_SECTION_PREVIEW_LIMIT
    );
  }, [activeQueueSignature, playerFeed.activeQueue, showDeferredHomeSections, songsSignature]);

  useEffect(() => {
    return () => {
      if (homeScrollSettleTimerRef.current) {
        clearTimeout(homeScrollSettleTimerRef.current);
        homeScrollSettleTimerRef.current = null;
      }
    };
  }, []);

  const handleHomeScrollBegin = useCallback(() => {
    if (homeScrollSettleTimerRef.current) {
      clearTimeout(homeScrollSettleTimerRef.current);
      homeScrollSettleTimerRef.current = null;
    }
    homeVerticalScrollingRef.current = true;
    setHomeAnimationsPaused(true);
    markFastScrolling(true);
  }, []);

  const handleHomeScrollEnd = useCallback(() => {
    markFastScrolling(false);
    if (homeScrollSettleTimerRef.current) {
      clearTimeout(homeScrollSettleTimerRef.current);
    }
    homeScrollSettleTimerRef.current = setTimeout(() => {
      homeVerticalScrollingRef.current = false;
      setHomeAnimationsPaused(false);
      homeScrollSettleTimerRef.current = null;
    }, HOME_SCROLL_SETTLE_MS);
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setHomeFocused(true);
      void refreshGenreSpotlightSignals();
      const interaction = InteractionManager.runAfterInteractions(() => {
        setShowDeferredHomeSections(true);
      });
      return () => {
        focusedRef.current = false;
        loadGenerationRef.current += 1;
        setHomeFocused(false);
        interaction.cancel();
      };
    }, [refreshGenreSpotlightSignals])
  );

  const listeningBrief = useMemo(() => {
    const current = playerFeed.currentSongMeta;
    if (current?.title) {
      return {
        label: homeUi.listening.nowPlaying,
        title: current.title,
        subtitle: getUserFacingArtist(current) || "Hidden Tunes",
        icon: "pulse" as const,
      };
    }

    return {
      label: homeUi.listening.nowPlaying,
      title: homeUi.listening.nothingPlaying,
      subtitle: homeUi.listening.tapToStart,
      icon: "musical-notes-outline" as const,
    };
  }, [homeUi.listening, playerFeed.currentSongMeta]);

  const heroCards = useMemo(
    () =>
      buildHeroCards(
        songs,
        homeFeaturedSongs,
        playerFeed.currentSongMeta,
        playerFeed.recentHead,
        homeUi.heroLabels
      ),
    [homeFeaturedSongs, homeUi.heroLabels, playerFeed.currentSongMeta, playerFeed.recentHead, songs]
  );

  const playCatalogSong = useCallback(
    (song: HiddenTunesSong | HiddenTunesNormalizedSong) => {
      const index = findSongIndex(songs, song);
      const catalogSong = index >= 0 ? songs[index] : (song as HiddenTunesSong);
      void playSong(catalogSong, songs, Math.max(index, 0), {
        source: "full_catalog",
        label: homeUiRef.current.queueLabels.fullCatalog,
        genre: catalogSong.genre,
        mood: catalogSong.mood,
        artistName: catalogSong.artist,
      });
    },
    [playSong, songs]
  );

  const openArtist = useCallback((artist: HiddenTunesArtistCatalogItem | HiddenTunesArtist) => {
    router.push({ pathname: "/artist", params: { artist: artist.name } } as any);
  }, []);

  const openAlbum = useCallback((album: HiddenTunesAlbumCatalogItem | HiddenTunesAlbum) => {
    const albumId = String(album.id || "").trim();
    if (albumId) {
      router.push({
        pathname: "/album/[id]",
        params: { id: albumId },
      } as any);
      return;
    }

    router.push({
      pathname: "/album",
      params: {
        album: album.title,
        artist: album.artist,
        thumbnail: album.artwork,
      },
    } as any);
  }, []);

  const openGenre = useCallback(
    (genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre | CatalogGroup) => {
      void recordGenreSpotlightOpen(genre.title);
      if (
        "type" in genre &&
        genre.type === "mood" &&
        Array.isArray(genre.songs)
      ) {
        const moodGenres = genre.songs
          .slice(0, 8)
          .map((song) => String((song as HiddenTunesSong)?.genre || "").trim())
          .filter(Boolean);
        if (moodGenres.length) {
          void recordMoodRoomGenreEngagement(moodGenres);
        }
      }
      router.push({
        pathname: "/genre",
        params: {
          title: genre.title,
          query: genre.title,
          id: genre.id,
          type: "type" in genre ? genre.type : "genre",
        },
      } as any);
    },
    []
  );

  const openGenreSeeAll = useCallback(() => {
    navigateToRoute("/worlds", { source: "music-feed.genreSpotlightsSeeAll" });
  }, []);

  const openTv = useCallback((video: any) => {
    void openVideoItemWithAlert(video);
  }, []);

  const openSearch = useCallback(() => {
    navigateToRoute("/search", { source: "music-feed.headerSearch" });
  }, []);

  const playSongFromList = useCallback(
    (song: HiddenTunesSong, queueSongs: HiddenTunesSong[], queueContext: PlaybackQueueContext) => {
      const queue = queueSongs.length ? queueSongs : songs;
      const queueIndex = findSongIndex(queue, song);
      void playSong(song, queue, Math.max(queueIndex, 0), {
        ...queueContext,
        artistName: queueContext.artistName || song.artist,
        genre: queueContext.genre || song.genre,
        mood: queueContext.mood || song.mood,
      });
    },
    [playSong, songs]
  );

  const handleHeroPress = useCallback(
    (card: HeroCard) => {
      const isCurrent =
        card.isCurrent ||
        String(playerFeed.currentSongMeta?.id || "") === String(card.song?.id || "");

      if (isCurrent) {
        router.push("/player" as any);
        return;
      }

      playCatalogSong(card.song);
    },
    [playCatalogSong, playerFeed.currentSongMeta?.id]
  );

  const keyExtractor = useCallback(
    (item: HiddenTunesSong, index: number) => String(item.id || index),
    []
  );

  const renderSongItem = useCallback(
    ({ item }: { item: HiddenTunesSong; index: number }) => (
      <HomeCatalogSongRow
        song={item as unknown as HiddenTunesNormalizedSong}
        onPress={playCatalogSong as (song: HiddenTunesNormalizedSong) => void}
      />
    ),
    [playCatalogSong]
  );

  const renderMoodRoomGridItem = useCallback(
    ({ item: room }: { item: CatalogGroup }) => (
      <View style={styles.gridCell}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.roomCard, styles.roomCardGrid]}
          onPress={() => openGenre(room)}
        >
          {/* HTImage sizes from width/height only — absoluteFill alone collapses to 0×0. */}
          <View pointerEvents="none" style={styles.roomImage}>
            <HTImage
              source={resolveGroupArtworkSource(room)}
              fallback={moodRoomFallbackArtwork(room.id)}
              style={styles.roomImageFill}
              contentFit="cover"
            />
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.72)"]}
            style={styles.roomShade}
          />
          <Text numberOfLines={1} style={styles.roomTitle}>
            {homeUiRef.current.roomTitle(room.id, room.title)}
          </Text>
          <Text numberOfLines={1} style={styles.roomSubtitle}>
            {homeUiRef.current.formatSongCount(room.songs.length)}
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [openGenre]
  );

  const renderRecentlyAddedGridItem = useCallback(
    ({ item, index }: { item: HiddenTunesSong; index: number }) => (
      <View style={styles.gridCell}>
        <HomeFeaturedCard
          item={item as unknown as HiddenTunesNormalizedSong}
          index={index}
          fillWidth
          onPress={(song) =>
            playSongFromList(song as HiddenTunesSong, recentlyAddedSongs, {
              source: "recently_added",
              label: homeUiRef.current.queueLabels.recentlyAdded,
              railId: "recently_added",
            })
          }
        />
      </View>
    ),
    [playSongFromList, recentlyAddedSongs]
  );

  const renderBecauseYouListenedGridItem = useCallback(
    ({ item, index }: { item: HiddenTunesSong; index: number }) => (
      <View style={styles.gridCell}>
        <HomeFeaturedCard
          item={item as unknown as HiddenTunesNormalizedSong}
          index={index}
          fillWidth
          onPress={(song) =>
            playSongFromList(song as HiddenTunesSong, becauseYouListened, {
              source: "because_you_listened",
              label: homeUiRef.current.queueLabels.becauseYouListened,
              railId: "because_you_listened",
            })
          }
        />
      </View>
    ),
    [becauseYouListened, playSongFromList]
  );

  const renderCreatorGridItem = useCallback(
    ({ item: artist }: { item: HiddenTunesArtistCatalogItem }) => (
      <View style={styles.gridCell}>
        <CreatorRailCard
          artist={artist}
          onPress={() => openArtist(artist)}
          animationsPaused={homeMotionPaused}
          songCountLabel={homeUiRef.current.formatSongCount(artist.songs.length)}
        />
      </View>
    ),
    [homeMotionPaused, openArtist]
  );

  const renderAlbumGridItem = useCallback(
    ({ item: album }: { item: HiddenTunesAlbumCatalogItem }) => (
      <View style={styles.gridCell}>
        <AlbumRailCard
          album={album}
          onPress={() => openAlbum(album)}
          animationsPaused={homeMotionPaused}
        />
      </View>
    ),
    [homeMotionPaused, openAlbum]
  );

  const renderOpenRoomGridItem = useCallback(
    ({ item: room }: { item: CatalogGroup }) => (
      <View style={styles.gridCell}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.roomCard, styles.roomCardGrid]}
          onPress={() => openGenre(room)}
        >
          <View pointerEvents="none" style={styles.roomImage}>
            <HTImage
              source={resolveGroupArtworkSource(room)}
              fallback={moodRoomFallbackArtwork(room.id)}
              style={styles.roomImageFill}
              contentFit="cover"
            />
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.72)"]}
            style={styles.roomShade}
          />
          <Text numberOfLines={1} style={styles.roomTitle}>
            {homeUiRef.current.roomTitle(room.id, room.title)}
          </Text>
          <Text numberOfLines={1} style={styles.roomSubtitle}>
            {homeUiRef.current.formatSongCount(room.songs.length)}
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [openGenre]
  );

  const renderGenreSpotlightItem = useCallback(
    ({ item: genre }: { item: HiddenTunesGenreCatalogItem }) => (
      <GenreSpotlightCard
        id={genre.id}
        title={genre.title}
        songCountLabel={homeUiRef.current.formatSongCount(genre.songs.length)}
        artwork={genre.artwork}
        songs={genre.songs}
        onPress={() => openGenre(genre)}
      />
    ),
    [openGenre]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <PremiumAmbientGlow style={styles.glowPurple} color="rgba(168,85,247,0.2)" paused={homeMotionPaused} />
        <PremiumAmbientGlow style={styles.glowCyan} color="rgba(34,211,238,0.14)" paused={homeMotionPaused} />
        <PremiumAmbientGlow style={styles.glowCenter} color="rgba(168,85,247,0.12)" paused={homeMotionPaused} />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              {homeLogoFailed ? (
                <Text numberOfLines={1} style={styles.logoFallbackText}>HT</Text>
              ) : (
                <Image
                  source={require("../assets/images/logo.png")}
                  style={styles.logoImage}
                  resizeMode="contain"
                  onError={() => setHomeLogoFailed(true)}
                />
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.refreshButton} onPress={openSearch}>
            <Ionicons name="search" size={22} color={COLORS.cyan} />
          </TouchableOpacity>
        </View>

        <FlatList
            data={visibleCatalogSongs}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            onScrollBeginDrag={handleHomeScrollBegin}
            onMomentumScrollBegin={handleHomeScrollBegin}
            onScrollEndDrag={handleHomeScrollEnd}
            onMomentumScrollEnd={handleHomeScrollEnd}
            removeClippedSubviews={catalogListPerf.removeClippedSubviews}
            initialNumToRender={catalogListPerf.initialNumToRender}
            maxToRenderPerBatch={catalogListPerf.maxToRenderPerBatch}
            windowSize={catalogListPerf.windowSize}
            updateCellsBatchingPeriod={catalogListPerf.updateCellsBatchingPeriod}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshCatalog}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              songs.length === 0 ? (
                showInlineCatalogLoading ? (
                  <View style={styles.inlineLoadingWrap}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>{homeUi.loadingMusic}</Text>
                  </View>
                ) : (
                  <View style={styles.catalogEmptyWrap}>
                    <PremiumEmptyState
                      icon="musical-notes-outline"
                      title={
                        catalogStatus === "error"
                          ? "Couldn't refresh music"
                          : homeUi.emptyTitle
                      }
                      message={
                        catalogStatus === "error"
                          ? TESTER_COPY.networkUnavailable
                          : homeUi.emptyCatalogMessage
                      }
                      actionLabel={homeUi.refreshCatalog}
                      onAction={() => void refreshCatalog()}
                    />
                  </View>
                )
              ) : null
            }
            ListHeaderComponent={
              <View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.searchPanel, { padding: searchPanelPadding }]}
                  onPress={openSearch}
                >
                  <Ionicons name="search" size={21} color={COLORS.cyan} />
                  <View style={styles.searchLauncherCopy}>
                    <Text style={styles.searchLauncherTitle}>{homeUi.searchLauncher}</Text>
                  </View>
                  <Ionicons name="sparkles" size={18} color={COLORS.primaryGlow} />
                </TouchableOpacity>

                {heroCards.length > 0 ? (
                  <HomeHeroCarousel
                    cards={heroCards}
                    heroCardWidth={heroCardWidth}
                    heroCardHeight={heroCardHeight}
                    heroActionLabels={homeUi.heroActions}
                    onPress={handleHeroPress}
                    animationsPaused={homeMotionPaused}
                    focused={homeFocused}
                  />
                ) : showInlineCatalogLoading ? (
                  <View style={styles.sectionSkeletonBlock}>
                    <View style={styles.sectionSkeletonHero} />
                    <View style={styles.sectionSkeletonLine} />
                    <View style={[styles.sectionSkeletonLine, styles.sectionSkeletonLineShort]} />
                  </View>
                ) : null}

                <>
                    <View style={styles.premiumSignalRow}>
                      <View style={styles.premiumSignalPill}>
                        <Ionicons name="cloud-done" size={14} color={COLORS.primaryGlow} />
                        <Text style={styles.premiumSignalText}>
                          {homeUi.signals.songsReady(songs.length.toLocaleString())}
                        </Text>
                      </View>
                      <View style={styles.premiumSignalPill}>
                        <Ionicons name="sparkles" size={14} color={COLORS.cyan} />
                        <Text style={styles.premiumSignalText}>{homeUi.signals.curatedRooms}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.listeningBrief}
                      onPress={() =>
                        playerFeed.currentSongMeta
                          ? router.push("/player" as any)
                          : openSearch()
                      }
                    >
                      <View style={[styles.discoveryChip, { marginBottom: 0 }]}>
                        <Ionicons name={listeningBrief.icon} size={16} color={COLORS.primary} />
                      </View>
                      <View style={styles.listeningBriefCopy}>
                        <Text style={styles.listeningLabel}>{listeningBrief.label}</Text>
                        <Text numberOfLines={1} style={styles.listeningTitle}>
                          {listeningBrief.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.listeningSubtitle}>
                          {listeningBrief.subtitle}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>

                    <View style={styles.homeShortcutGrid}>
                      {HOME_DISCOVERY_SHORTCUTS.map((shortcut) => (
                        <HomeDiscoveryShortcut
                          key={shortcut.key}
                          icon={shortcut.icon}
                          title={homeUi.shortcutTitle(shortcut.key, shortcut.title)}
                          color={shortcut.color}
                          accessibilityLabel={homeUi.shortcutAccessibility(
                            homeUi.shortcutTitle(shortcut.key, shortcut.title)
                          )}
                          onPress={() =>
                            navigateToRoute(shortcut.route, {
                              source: "music-feed.discoveryShortcut",
                            })
                          }
                        />
                      ))}
                    </View>
                </>

                {showDeferredHomeSections ? (
                <>
                    <EmotionalDiscoveryChips
                      style={styles.emotionalWorldsSection}
                      showGatewayRows={false}
                      title={homeUi.emotionalWorldsTitle}
                      subtitle={homeUi.emotionalWorldsSubtitle}
                    />

                    {moodRooms.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>{homeUi.sections.forYourMood}</Text>
                        <Text style={styles.sectionTitle}>{homeUi.sections.moodRooms}</Text>
                        <PremiumContentGrid
                          data={moodRooms}
                          keyExtractor={(room) => room.id}
                          renderItem={renderMoodRoomGridItem}
                          maxItems={HOME_SECTION_PREVIEW_LIMIT}
                          scrollEnabled={false}
                          horizontalPadding={0}
                          listKey="home-mood-rooms"
                        />
                      </View>
                    ) : null}
                    {showDeferredHomeSections ? (
                      <View style={styles.cinematicSection}>
                        <LinearGradient
                          pointerEvents="none"
                          colors={["rgba(168,85,247,0.22)", "rgba(34,211,238,0.08)"]}
                          style={styles.sectionAura}
                        />
                        <View style={styles.sectionHeaderRow}>
                          <View>
                            <Text style={styles.sectionEyebrow}>{homeUi.sections.new}</Text>
                            <Text style={styles.sectionTitle}>{homeUi.sections.recentlyAdded}</Text>
                          </View>
                          {recentlyAddedSongs.length > 0 ? (
                            <Text style={styles.sectionMeta}>{homeUi.sections.play}</Text>
                          ) : null}
                        </View>
                        {recentlyAddedSongs.length > 0 ? (
                          <PremiumContentGrid
                            data={recentlyAddedSongs}
                            keyExtractor={(item) => `recently-${item.id}`}
                            renderItem={renderRecentlyAddedGridItem}
                            maxItems={HOME_SECTION_PREVIEW_LIMIT}
                            scrollEnabled={false}
                            horizontalPadding={0}
                            listKey="home-recently-added"
                          />
                        ) : (
                          <Text style={styles.sectionEmptyMeta}>
                            {homeUi.recentlyAddedEmpty}
                          </Text>
                        )}
                      </View>
                    ) : null}

                    {becauseYouListened.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>{homeUi.sections.listener}</Text>
                        <Text style={styles.sectionTitle}>{homeUi.sections.becauseYouListened}</Text>
                        <PremiumContentGrid
                          data={becauseYouListened}
                          keyExtractor={(item) => `because-${item.id}`}
                          renderItem={renderBecauseYouListenedGridItem}
                          maxItems={HOME_SECTION_PREVIEW_LIMIT}
                          scrollEnabled={false}
                          horizontalPadding={0}
                          listKey="home-because-you-listened"
                        />
                      </View>
                    ) : null}

                    {smartQueueSongs.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>{homeUi.sections.next}</Text>
                        <Text style={styles.sectionTitle}>{homeUi.sections.smartMusicQueue}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {smartQueueSongs.map((item, index) => (
                            <HomeFeaturedCard
                              key={`smart-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, smartQueueSongs, {
                                source: "smart_queue",
                                label: homeUiRef.current.queueLabels.smartMusicQueue,
                                railId: "smart_queue",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleArtists.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>{homeUi.sections.creators}</Text>
                        <Text style={styles.sectionTitle}>{homeUi.sections.creatorsInOrbit}</Text>
                        <PremiumContentGrid
                          data={visibleArtists}
                          keyExtractor={(artist) => artist.id}
                          renderItem={renderCreatorGridItem}
                          maxItems={HOME_SECTION_PREVIEW_LIMIT}
                          scrollEnabled={false}
                          horizontalPadding={0}
                          listKey="home-creators"
                        />
                      </View>
                    ) : null}

                    {visibleAlbums.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>{homeUi.sections.collections}</Text>
                        <Text style={styles.sectionTitle}>{homeUi.sections.albumsWorthStaying}</Text>
                        <PremiumContentGrid
                          data={visibleAlbums}
                          keyExtractor={(album) => {
                            const id = String(album.id || "").trim();
                            if (id) return id;
                            return `album:${String(album.artist || "").trim()}:${String(album.title || "").trim()}`;
                          }}
                          renderItem={renderAlbumGridItem}
                          maxItems={HOME_SECTION_PREVIEW_LIMIT}
                          scrollEnabled={false}
                          horizontalPadding={0}
                          listKey="home-albums"
                        />
                      </View>
                    ) : null}

                    {openRooms.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>{homeUi.sections.rooms}</Text>
                        <Text style={styles.sectionTitle}>{homeUi.sections.openRooms}</Text>
                        <PremiumContentGrid
                          data={openRooms}
                          keyExtractor={(room) => room.id}
                          renderItem={renderOpenRoomGridItem}
                          maxItems={HOME_SECTION_PREVIEW_LIMIT}
                          scrollEnabled={false}
                          horizontalPadding={0}
                          listKey="home-open-rooms"
                        />
                      </View>
                    ) : null}

                    {visibleGenres.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <View style={styles.sectionHeaderRow}>
                          <View style={styles.genreSpotlightHeaderCopy}>
                            <Text style={styles.sectionEyebrow}>{homeUi.sections.genres}</Text>
                            <Text style={styles.sectionTitle}>
                              {genreSpotlightsPersonalized
                                ? homeUi.sections.madeForYou
                                : homeUi.sections.moodGenreSpotlights}
                            </Text>
                          </View>
                          <TouchableOpacity
                            activeOpacity={0.86}
                            onPress={openGenreSeeAll}
                            accessibilityRole="button"
                            accessibilityLabel="See all genres"
                            hitSlop={8}
                          >
                            <Text style={styles.sectionSeeAll}>See all</Text>
                          </TouchableOpacity>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          scrollEnabled={visibleGenres.length > 2}
                          nestedScrollEnabled
                          style={styles.genreSpotlightRail}
                          contentContainerStyle={styles.genreSpotlightRailContent}
                        >
                          {visibleGenres.map((genre, index) => (
                            <View
                              key={genre.id}
                              style={index === visibleGenres.length - 1 ? undefined : styles.genreSpotlightItem}
                            >
                              {renderGenreSpotlightItem({ item: genre })}
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                </>
                ) : null}

                <View style={styles.catalogHeaderRow}>
                  <View>
                    <Text style={styles.sectionEyebrow}>{homeUi.sections.fullCatalog}</Text>
                    <Text style={[styles.sectionTitle, styles.songsSectionTitle]}>{homeUi.sections.allSongs}</Text>
                  </View>
                  <Text style={styles.catalogCount}>{Math.min(visibleCatalogCount, songs.length)}/{songs.length}</Text>
                </View>
              </View>
            }
            ListFooterComponent={
              canLoadMore ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.loadMoreButton}
                  onPress={() =>
                    setVisibleCatalogCount((count) =>
                      Math.min(count + CATALOG_PAGE_SIZE, songs.length)
                    )
                  }
                >
                  <Text style={styles.loadMoreText}>{homeUi.loadMore}</Text>
                  <Ionicons name="chevron-down" size={18} color="#000" />
                </TouchableOpacity>
              ) : null
            }
            renderItem={renderSongItem}
          />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: HOME_HEADER.contentPaddingTop,
    paddingHorizontal: HOME_HEADER.contentPaddingHorizontal,
  },
  glowPurple: {
    position: "absolute",
    top: 48,
    left: -126,
    width: 318,
    height: 318,
    borderRadius: 159,
    backgroundColor: "rgba(168,85,247,0.24)",
  },
  glowCyan: {
    position: "absolute",
    top: 302,
    right: -142,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: "rgba(34,211,238,0.13)",
  },
  glowCenter: {
    position: "absolute",
    top: 158,
    alignSelf: "center",
    width: 260,
    height: 190,
    borderRadius: 130,
    backgroundColor: "rgba(168,85,247,0.16)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: HOME_HEADER.rowMarginBottom,
  },

  refreshButton: {
    width: HOME_HEADER.actionSize,
    height: HOME_HEADER.actionSize,
    borderRadius: HOME_HEADER.actionRadius,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  inlineLoadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 22,
  },
  sectionSkeletonBlock: {
    marginTop: 8,
    marginBottom: 18,
    gap: 12,
  },
  sectionSkeletonHero: {
    height: 220,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionSkeletonLine: {
    height: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    width: "72%",
  },
  sectionSkeletonLineShort: {
    width: "46%",
  },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontWeight: "700" },
  emptyIcon: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.16)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    fontWeight: "700",
  },
  list: { paddingBottom: 172 },
  heroStage: {
    marginBottom: 18,
    position: "relative",
  },
  heroStageGlow: {
    position: "absolute",
    top: 18,
    left: 8,
    right: 8,
    height: 310,
    borderRadius: 120,
    overflow: "hidden",
  },
  heroList: {
    paddingRight: 18,
  },
  heroSlide: {
    marginRight: 14,
  },
  heroBorder: {
    borderRadius: 36,
    padding: 2,
  },
  heroCard: {
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: "rgba(18,7,31,0.44)",
    ...SHADOWS.premium,
  },
  heroActiveGlow: {
    position: "absolute",
    top: -24,
    left: -18,
    right: -18,
    height: 120,
    backgroundColor: COLORS.primary,
    borderRadius: 70,
    zIndex: 1,
  },
  heroInner: {
    flex: 1,
    zIndex: 2,
    position: "relative",
  },
  heroArtworkPanel: {
    flex: 1,
    marginHorizontal: 9,
    marginTop: 9,
    marginBottom: 9,
    minHeight: 260,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    ...SHADOWS.artwork,
  },
  heroTextScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "46%",
    zIndex: 3,
  },
  heroTextBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 8,
    zIndex: 4,
  },
  heroArtworkAura: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    borderRadius: 22,
    overflow: "hidden",
  },
  heroArtworkImage: {
    width: "100%",
    height: "100%",
  },
  heroArtworkFade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.58)",
    marginBottom: 8,
  },
  liveText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  heroSong: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
    marginTop: 2,
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 14,
  },
  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  heroPlayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
  },
  heroPlayText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroCountPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroCountText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },
  heroDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroDotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    overflow: "visible",
  },
  heroDotGlow: {
    position: "absolute",
    top: -10,
    left: -14,
    right: -14,
    bottom: -10,
    borderRadius: 20,
    overflow: "hidden",
  },
  listeningBrief: {
    marginBottom: 14,
    borderRadius: 22,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  listeningBriefCopy: { flex: 1, paddingRight: 12 },
  listeningLabel: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  listeningTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  listeningSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  waveformShell: {
    width: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  discoveryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  discoveryChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  tvLink: {
    marginLeft: 0,
  },
  moodChipRow: {
    gap: 10,
    paddingRight: 18,
    marginBottom: 14,
  },
  moodChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.18)",
  },
  moodChipText: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
  },
  searchPanel: {
    marginBottom: 18,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(39,14,60,0.38)",
    borderWidth: 1.5,
    borderColor: "rgba(168,85,247,0.34)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  searchLauncherCopy: {
    flex: 1,
    minWidth: 0,
  },
  searchLauncherTitle: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: "800",
  },
  searchPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  searchPanelTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  searchInputShell: {
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 0,
  },
  searchResultsPanel: {
    paddingBottom: 14,
  },
  searchLoadingPanel: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  searchLoadingText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  emotionalWorldsSection: {
    marginTop: 28,
    marginHorizontal: 0,
  },
  cinematicSection: {
    marginBottom: SPACING.section - 4,
    position: "relative",
    overflow: "hidden",
    borderRadius: 22,
    paddingTop: 4,
  },
  sectionAura: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 70,
    borderRadius: 22,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 13,
    paddingHorizontal: 2,
  },
  genreSpotlightHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  genreSpotlightRail: {
    marginTop: -2,
    marginHorizontal: -2,
  },
  genreSpotlightRailContent: {
    paddingRight: 12,
    paddingLeft: 2,
  },
  genreSpotlightGap: {
    width: 12,
  },
  genreSpotlightItem: {
    marginRight: 12,
  },
  sectionSeeAll: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },
  sectionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 3,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: "800",
    lineHeight: TYPOGRAPHY.sectionTitle + 3,
  },
  songsSectionTitle: {
    marginBottom: 13,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  featuredRow: {
    paddingRight: 18,
    paddingLeft: 2,
  },
  surfaceRow: {
    gap: 12,
    paddingRight: 18,
    paddingLeft: 2,
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
  },
  surfaceCardShell: {
    width: 244,
  },
  surfaceCardShellGrid: {
    width: "100%",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logoMark: {
    width: 132,
    height: 58,
    alignItems: "flex-start",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  logoFallbackText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
    paddingHorizontal: 2,
  },
  catalogStatus: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 2,
    marginBottom: 18,
    textTransform: "uppercase",
  },
  premiumSignalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 0,
    marginBottom: 18,
    justifyContent: "center",
  },
  premiumSignalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  premiumSignalText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  homeShortcutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: SPACING.section,
    justifyContent: "space-between",
  },
  catalogEmptyWrap: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  sectionEmptyMeta: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    paddingRight: 12,
  },
  sectionLoader: {
    alignSelf: "flex-start",
    marginVertical: 8,
  },
  discoveryRailRow: {
    paddingRight: 18,
    paddingLeft: 2,
    paddingBottom: 4,
  },
  podcastShowChip: {
    width: 148,
    marginRight: 10,
    borderRadius: 18,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  podcastShowArt: {
    width: "100%",
    height: 96,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  podcastShowArtFallback: {
    width: "100%",
    height: 96,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  podcastShowTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    lineHeight: 16,
  },
  podcastShowSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  quickButton: {
    flex: 1,
    minHeight: 78,
    borderRadius: 20,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  quickText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  roomCard: {
    width: 172,
    height: 148,
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingBottom: 10,
    justifyContent: "flex-end",
    backgroundColor: "rgba(18,7,31,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  roomCardGrid: {
    width: "100%",
    height: undefined,
    aspectRatio: 172 / 148,
  },
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomImageFill: {
    width: "100%",
    height: "100%",
  },
  roomShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    zIndex: 2,
  },
  roomSubtitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "500",
    marginTop: 2,
    zIndex: 2,
    opacity: 0.92,
  },
  creatorCard: {
    borderRadius: 22,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    ...SHADOWS.card,
  },
  creatorArtWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  creatorArtAura: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    borderRadius: 18,
    overflow: "hidden",
  },
  creatorArt: {
    width: "100%",
    height: "100%",
  },
  creatorName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  creatorMeta: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "500",
    marginTop: 3,
  },
  albumRailCard: {
    borderRadius: 22,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    ...SHADOWS.card,
  },
  albumArtWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  albumArtAura: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    borderRadius: 18,
    overflow: "hidden",
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  albumArtist: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "500",
    marginTop: 3,
  },
  catalogHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 6,
  },
  catalogCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 15,
  },
  loadMoreButton: {
    marginTop: 12,
    marginBottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  loadMoreText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
