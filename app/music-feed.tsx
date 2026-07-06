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

import AppShell from "@/components/navigation/AppShell";
import { EmotionalDiscoveryChips } from "@/components/EmotionalDiscoveryChips";
import { HomeHeroCard, type HomeHeroCardData } from "@/components/home/HomeHeroCard";
import { usePlayerFeedSnapshot } from "@/utils/playerFeedStore";
import HTImage from "@/components/HTImage";
import UnifiedMediaCard from "@/components/UnifiedMediaCard";
import FavoriteButton from "@/components/FavoriteButton";
import { HomeCatalogSongRow, HomeFeaturedCard } from "@/components/catalog/HomePlaybackRows";
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
  fetchHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
  isDerivedCatalogTrusted,
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesArtistCatalogItem,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesGenreCatalogItem,
  type HiddenTunesSong,
} from "@/services/hiddenTunes";
import {
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "@/services/hiddenTunesApi";
import type { HiddenTunesGenre } from "@/utils/genres";
import {
  getArtworkUri,
  resolveGroupArtworkSource,
} from "@/utils/artwork";
import {
  getListPerformanceSettings,
  isAppActiveForWork,
  markFastScrolling,
  useAppActiveState,
} from "@/utils/performanceMode";
import { logPerformanceOffscreenWorkPaused } from "@/utils/performanceLogs";
import { TESTER_COPY } from "@/constants/testerExperience";
import { openVideoItem } from "@/services/videos/openVideoItem";
import PremiumEmptyState from "@/components/PremiumEmptyState";
import {
  hydrateDiscoveryPreferredGenres,
  sortItemsByPreferredGenres,
} from "@/utils/discoveryPreferences";
import { getUserFacingArtist } from "@/services/ui/displayMetadata";
import { buildAlbumFavoriteItem } from "@/services/favorites/favoriteItemBuilders";

const CATALOG_PAGE_SIZE = 31;
const HOME_SCROLL_SETTLE_MS = 520;

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
  return {
    id,
    title,
    subtitle: `${groupSongs.length} song${groupSongs.length === 1 ? "" : "s"}`,
    artwork: getArtwork(groupSongs[0]),
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
    if (!appActive || paused) {
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
    if (!appActive || paused) {
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
  width,
  onPress,
  animationsPaused = false,
}: {
  artist: HiddenTunesArtistCatalogItem;
  width: number;
  onPress: () => void;
  animationsPaused?: boolean;
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
        {artist.songs.length} song{artist.songs.length === 1 ? "" : "s"}
      </Text>
    </TouchableOpacity>
  );
});

const AlbumRailCard = memo(function AlbumRailCard({
  album,
  width,
  onPress,
  animationsPaused = false,
}: {
  album: HiddenTunesAlbumCatalogItem;
  width: number;
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
        <View style={styles.albumFavoriteButton}>
          <FavoriteButton
            item={buildAlbumFavoriteItem({
              id: String(album.id),
              title: album.title,
              artist: album.artist,
              artwork: album.artwork,
            })}
            size={18}
          />
        </View>
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
  paused = false,
  onPress,
}: {
  children: ReactNode;
  height: number;
  isActive: boolean;
  paused?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const appActive = useAppActiveState();

  useEffect(() => {
    cancelAnimation(glow);
    if (!appActive || paused) {
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
  }, [appActive, glow, isActive, paused]);

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
  onPress,
  animationsPaused,
  focused,
}: {
  cards: HeroCard[];
  heroCardWidth: number;
  heroCardHeight: number;
  onPress: (card: HeroCard) => void;
  animationsPaused: boolean;
  focused: boolean;
}) {
  const [heroIndex, setHeroIndex] = useState(0);
  const heroListRef = useRef<FlatList<HeroCard> | null>(null);

  useEffect(() => {
    if (cards.length <= 1) return;

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
        onPress={handleHeroPress}
        HeroPressable={PremiumHeroPressable}
        LuxuryPulse={HeroLuxuryPulse}
        animationsPaused={animationsPaused}
        styles={styles}
      />
    ),
    [HeroLuxuryPulse, cards.length, handleHeroPress, heroCardHeight, heroCardWidth, heroIndex]
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

function buildHeroCards(
  songs: HiddenTunesSong[],
  featuredSongs: HiddenTunesSong[],
  currentSong: { id?: string; title?: string; artist?: string } | null,
  recentlyPlayed: Array<{ id?: string; title?: string; artist?: string }>
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
      label: "NOW PLAYING",
      title: currentSong.title || match.title || "Now playing",
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
      label: "FEATURED",
      title: primary.title,
      subtitle: getUserFacingArtist(primary) || "Hidden Tunes",
      song: primary as unknown as HiddenTunesNormalizedSong,
      icon: "sparkles",
    });
  }

  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: "PICK",
      title: pick.title,
      subtitle: getUserFacingArtist(pick) || "Editor pick",
      song: pick as unknown as HiddenTunesNormalizedSong,
      icon: "cloud-done",
    });
  }

  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || "GENRE").toUpperCase(),
      title: genreSong.title,
      subtitle: getUserFacingArtist(genreSong) || "Genre spotlight",
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
        label: "RECENTLY PLAYED",
        title: recent.title || recentSong.title,
        subtitle:
          getUserFacingArtist(recent) ||
          getUserFacingArtist(recentSong) ||
          "In rotation",
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

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const playerFeed = usePlayerFeedSnapshot();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(CATALOG_PAGE_SIZE);
  const [showDeferredHomeSections, setShowDeferredHomeSections] = useState(false);
  const [homeLogoFailed, setHomeLogoFailed] = useState(false);
  const [homeAnimationsPaused, setHomeAnimationsPaused] = useState(false);
  const [homeFocused, setHomeFocused] = useState(true);
  const homeVerticalScrollingRef = useRef(false);
  const homeScrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width: viewportWidth } = useWindowDimensions();
  const heroCardWidth = Math.min(440, Math.max(304, viewportWidth - 64));
  const heroCardHeight = Math.min(500, Math.max(382, Math.round(heroCardWidth * 1.16)));
  const railCardWidth = Math.min(252, Math.max(212, viewportWidth * 0.66));
  const searchPanelPadding = viewportWidth < 380 ? 10 : 12;
  const homeEffectsPaused = homeAnimationsPaused || !homeFocused;

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];

  const loadCatalog = useCallback(async () => {
    void hydrateDiscoveryPreferredGenres();
    const cached = getCachedHiddenTunesCatalog();
    if (cached && isDerivedCatalogTrusted(cached)) {
      setCatalog(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchHiddenTunesCatalog();
      setCatalog(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void loadCatalog();
    });
    return () => task.cancel();
  }, [loadCatalog]);

  useEffect(() => {
    if (loading) {
      setShowDeferredHomeSections(false);
      return;
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      setShowDeferredHomeSections(true);
    });

    return () => interaction.cancel();
  }, [loading]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchHiddenTunesCatalog({ forceRefresh: true });
      setCatalog(data);
      setVisibleCatalogCount(CATALOG_PAGE_SIZE);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const songsSignature = useMemo(() => buildSongListSignature(songs), [songs]);
  const recentArtistSignature = playerFeed.recentArtistSignature;
  const favoriteArtistSignature = playerFeed.favoriteArtistSignature;
  const activeQueueSignature = playerFeed.activeQueueSignature;

  const visiblePlaylists = useMemo(() => playlists.slice(0, 6), [playlists]);
  const featuredSongs = useMemo(() => songs.slice(0, 8), [songs]);
  const moodGenreChips = useMemo(() => genres.slice(0, 4), [genres]);
  const recentlyAddedSongs = useMemo(
    () => (showDeferredHomeSections ? songs.slice(0, 12) : []),
    [showDeferredHomeSections, songs]
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
    () => (showDeferredHomeSections ? artists.slice(0, 12) : []),
    [artists, showDeferredHomeSections]
  );
  const visibleAlbums = useMemo(
    () => (showDeferredHomeSections ? albums.slice(0, 12) : []),
    [albums, showDeferredHomeSections]
  );
  const genreSignature = useMemo(() => buildSongListSignature(genres), [genres]);
  const visibleGenres = useMemo(
    () =>
      showDeferredHomeSections
        ? sortItemsByPreferredGenres(genres).slice(0, 10)
        : [],
    [genreSignature, showDeferredHomeSections]
  );
  const visibleCatalogSongs = useMemo(() => songs.slice(0, visibleCatalogCount), [songs, visibleCatalogCount]);
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
    return uniqSongs(candidates.length ? candidates : songs.slice(8, 24)).slice(0, 12);
  }, [favoriteArtistSignature, recentArtistSignature, showDeferredHomeSections, songsSignature]);

  const smartQueueSongs = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    const queueSongs = Array.isArray(playerFeed.activeQueue)
      ? (playerFeed.activeQueue as HiddenTunesSong[])
      : [];
    return uniqSongs((queueSongs.length ? queueSongs : songs.slice(12, 30)).filter(Boolean)).slice(0, 12);
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
      setHomeFocused(true);
      return () => {
        setHomeFocused(false);
      };
    }, [])
  );

  const heroCards = useMemo(
    () =>
      buildHeroCards(
        songs,
        featuredSongs,
        playerFeed.currentSongMeta,
        playerFeed.recentHead
      ),
    [featuredSongs, playerFeed.currentSongMeta, playerFeed.recentHead, songs]
  );

  const playCatalogSong = useCallback(
    (song: HiddenTunesSong | HiddenTunesNormalizedSong) => {
      const index = findSongIndex(songs, song);
      const catalogSong = index >= 0 ? songs[index] : (song as HiddenTunesSong);
      void playSong(catalogSong, songs, Math.max(index, 0), {
        source: "full_catalog",
        label: "Full Catalog",
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

  const openGenre = useCallback((genre: HiddenTunesGenreCatalogItem | HiddenTunesGenre | CatalogGroup) => {
    router.push({
      pathname: "/genre",
      params: {
        title: genre.title,
        query: genre.title,
        id: genre.id,
        type: "type" in genre ? genre.type : "genre",
      },
    } as any);
  }, []);

  const openTv = useCallback((video: any) => {
    openVideoItem(video);
  }, []);

  const openSearch = useCallback(() => {
    router.push("/search" as any);
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

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <PremiumAmbientGlow style={styles.glowPurple} color="rgba(168,85,247,0.2)" paused={homeEffectsPaused} />
        <PremiumAmbientGlow style={styles.glowCyan} color="rgba(34,211,238,0.14)" paused={homeEffectsPaused} />
        <PremiumAmbientGlow style={styles.glowCenter} color="rgba(168,85,247,0.12)" paused={homeEffectsPaused} />

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

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your music...</Text>
          </View>
        ) : songs.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="musical-notes" size={58} color={COLORS.primary} />
            </View>

            <PremiumEmptyState
              icon="musical-notes-outline"
              title="Nothing here yet"
              message={TESTER_COPY.catalogEmptyHome}
              actionLabel="Refresh catalog"
              onAction={() => void refreshCatalog()}
            />
          </View>
        ) : (
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
            ListHeaderComponent={
              <View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.searchPanel, { padding: searchPanelPadding }]}
                  onPress={openSearch}
                >
                  <Ionicons name="search" size={21} color={COLORS.cyan} />
                  <View style={styles.searchLauncherCopy}>
                    <Text style={styles.searchLauncherTitle}>Search Hidden Tunes...</Text>
                  </View>
                  <Ionicons name="sparkles" size={18} color={COLORS.primaryGlow} />
                </TouchableOpacity>

                {heroCards.length > 0 ? (
                  <HomeHeroCarousel
                    cards={heroCards}
                    heroCardWidth={heroCardWidth}
                    heroCardHeight={heroCardHeight}
                    onPress={handleHeroPress}
                    animationsPaused={homeEffectsPaused}
                    focused={homeFocused}
                  />
                ) : null}

                <>
                    <View style={styles.premiumSignalRow}>
                      <View style={styles.premiumSignalPill}>
                        <Ionicons name="cloud-done" size={14} color={COLORS.primaryGlow} />
                        <Text style={styles.premiumSignalText}>{songs.length.toLocaleString()}+ songs ready</Text>
                      </View>
                      <View style={styles.premiumSignalPill}>
                        <Ionicons name="sparkles" size={14} color={COLORS.cyan} />
                        <Text style={styles.premiumSignalText}>Curated rooms</Text>
                      </View>
                    </View>

                    <View style={styles.quickGrid}>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={() => router.push("/playlists" as any)}>
                        <Ionicons name="musical-notes" size={19} color={COLORS.primaryGlow} />
                        <Text style={styles.quickText}>Music</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={openSearch}>
                        <Ionicons name="search" size={19} color={COLORS.cyan} />
                        <Text style={styles.quickText}>Search</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={() => router.push("/queue" as any)}>
                        <Ionicons name="list" size={19} color={COLORS.primary} />
                        <Text style={styles.quickText}>Queue</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} style={styles.quickButton} onPress={() => router.push("/worlds" as any)}>
                        <Ionicons name="heart" size={19} color="#F472B6" />
                        <Text style={styles.quickText}>Feelings</Text>
                      </TouchableOpacity>
                    </View>
                </>

                {showDeferredHomeSections ? (
                <>
                    <EmotionalDiscoveryChips style={styles.emotionalWorldsSection} />

                    {moodRooms.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>FOR YOUR MOOD</Text>
                        <Text style={styles.sectionTitle}>Mood Rooms</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {moodRooms.map((room) => (
                            <TouchableOpacity key={room.id} activeOpacity={0.88} style={styles.roomCard} onPress={() => openGenre(room)}>
                              <HTImage
                                source={resolveGroupArtworkSource(room)}
                                style={styles.roomImage}
                                contentFit="cover"
                              />
                              <LinearGradient
                                pointerEvents="none"
                                colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.72)"]}
                                style={styles.roomShade}
                              />
                              <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                              <Text numberOfLines={1} style={styles.roomSubtitle}>{room.subtitle}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                    {recentlyAddedSongs.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <LinearGradient
                          pointerEvents="none"
                          colors={["rgba(168,85,247,0.22)", "rgba(34,211,238,0.08)"]}
                          style={styles.sectionAura}
                        />
                        <View style={styles.sectionHeaderRow}>
                          <View>
                            <Text style={styles.sectionEyebrow}>NEW</Text>
                            <Text style={styles.sectionTitle}>Recently Added</Text>
                          </View>
                          <Text style={styles.sectionMeta}>Play</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {recentlyAddedSongs.map((item, index) => (
                            <HomeFeaturedCard
                              key={`recently-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, recentlyAddedSongs, {
                                source: "recently_added",
                                label: "Recently Added",
                                railId: "recently_added",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {becauseYouListened.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>LISTENER</Text>
                        <Text style={styles.sectionTitle}>Because You Listened</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {becauseYouListened.map((item, index) => (
                            <HomeFeaturedCard
                              key={`because-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, becauseYouListened, {
                                source: "because_you_listened",
                                label: "Because You Listened",
                                railId: "because_you_listened",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {smartQueueSongs.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>NEXT</Text>
                        <Text style={styles.sectionTitle}>Smart Music Queue</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
                          {smartQueueSongs.map((item, index) => (
                            <HomeFeaturedCard
                              key={`smart-${item.id}`}
                              item={item as unknown as HiddenTunesNormalizedSong}
                              index={index}
                              onPress={(song) => playSongFromList(song as HiddenTunesSong, smartQueueSongs, {
                                source: "smart_queue",
                                label: "Smart Music Queue",
                                railId: "smart_queue",
                              })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleArtists.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>CREATORS</Text>
                        <Text style={styles.sectionTitle}>Creators In Your Orbit</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visibleArtists.map((artist) => (
                            <CreatorRailCard
                              key={artist.id}
                              artist={artist}
                              width={railCardWidth}
                              onPress={() => openArtist(artist)}
                              animationsPaused={homeEffectsPaused}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleAlbums.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>COLLECTIONS</Text>
                        <Text style={styles.sectionTitle}>Albums Worth Staying With</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visibleAlbums.map((album) => (
                            <AlbumRailCard
                              key={album.id}
                              album={album}
                              width={railCardWidth}
                              onPress={() => openAlbum(album)}
                              animationsPaused={homeEffectsPaused}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {openRooms.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>ROOMS</Text>
                        <Text style={styles.sectionTitle}>Open Rooms</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surfaceRow}>
                          {openRooms.map((room) => (
                            <TouchableOpacity key={room.id} activeOpacity={0.88} style={styles.roomCard} onPress={() => openGenre(room)}>
                              <HTImage
                                source={resolveGroupArtworkSource(room)}
                                style={styles.roomImage}
                                contentFit="cover"
                              />
                              <LinearGradient
                                pointerEvents="none"
                                colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.72)"]}
                                style={styles.roomShade}
                              />
                              <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                              <Text numberOfLines={1} style={styles.roomSubtitle}>{room.subtitle}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {visibleGenres.length > 0 ? (
                      <View style={styles.cinematicSection}>
                        <Text style={styles.sectionEyebrow}>GENRES</Text>
                        <Text style={styles.sectionTitle}>Mood Rooms / Genre Spotlights</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.surfaceRow}
                        >
                          {visibleGenres.map((genre) => (
                            <View key={genre.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={genre.title}
                                subtitle={`${genre.songs.length} song${genre.songs.length === 1 ? "" : "s"}`}
                                image={genre}
                                rightIcon="sparkles"
                                onPress={() => openGenre(genre)}
                                onRightPress={() => openGenre(genre)}
                              />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                </>
                ) : null}

                <View style={styles.catalogHeaderRow}>
                  <View>
                    <Text style={styles.sectionEyebrow}>FULL CATALOG</Text>
                    <Text style={[styles.sectionTitle, styles.songsSectionTitle]}>All Songs</Text>
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
                  <Text style={styles.loadMoreText}>Load More</Text>
                  <Ionicons name="chevron-down" size={18} color="#000" />
                </TouchableOpacity>
              ) : null
            }
            renderItem={renderSongItem}
          />
        )}
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
    height: 360,
    borderRadius: 150,
    overflow: "hidden",
  },
  heroList: {
    paddingRight: 18,
  },
  heroSlide: {
    marginRight: 14,
  },
  heroBorder: {
    borderRadius: 38,
    padding: 2,
  },
  heroCard: {
    borderRadius: 36,
    overflow: "hidden",
    backgroundColor: "rgba(18,7,31,0.44)",
    ...SHADOWS.premium,
  },
  heroActiveGlow: {
    position: "absolute",
    top: -24,
    left: -18,
    right: -18,
    height: 92,
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
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 10,
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
    height: "40%",
    zIndex: 3,
  },
  heroTextBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25,
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
  heroFavoriteButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    marginLeft: 8,
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
  surfaceCardShell: {
    width: 244,
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
  quickGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: SPACING.section,
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
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
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
  albumFavoriteButton: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    zIndex: 4,
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
