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

import { router } from "expo-router";
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
import { SubtleTvEntryLink } from "@/components/EmotionalDiscoveryChips";
import HTImage from "@/components/HTImage";
import LiveWaveform from "@/components/LiveWaveform";
import NeonEQ from "@/components/NeonEQ";
import UnifiedMediaCard from "@/components/UnifiedMediaCard";
import { HomeCatalogSongRow, HomeFeaturedCard } from "@/components/catalog/HomePlaybackRows";
import {
  COLORS,
  GRADIENTS,
  LUXURY_GLOW,
  LOGO_SIZES,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "@/context/PlayerContext";
import type { PlaybackQueueContext } from "@/context/PlayerContext";
import {
  fetchHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
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

const CATALOG_PAGE_SIZE = 31;

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
  return [song.title, song.artist, song.album, song.genre, song.mood, song.lyrics]
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
}: {
  style: object;
  color: string;
}) {
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);

  useEffect(() => {
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
  }, [opacity]);

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
}: {
  style?: object;
}) {
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const scale = useSharedValue<number>(LUXURY_GLOW.scaleMin);

  useEffect(() => {
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
  }, [opacity, scale]);

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

const PremiumHeroPressable = memo(function PremiumHeroPressable({
  children,
  height,
  isActive,
  onPress,
}: {
  children: ReactNode;
  height: number;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue<number>(LUXURY_GLOW.opacityMin);

  useEffect(() => {
    cancelAnimation(glow);
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
  }, [glow, isActive]);

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

type HeroCard = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  song: HiddenTunesNormalizedSong;
  icon: keyof typeof Ionicons.glyphMap;
  isCurrent?: boolean;
};

function findSongIndex(songs: HiddenTunesSong[], song: { id?: string }) {
  const id = String(song?.id || "");
  return songs.findIndex((candidate) => String(candidate.id) === id);
}

function buildHeroCards(
  songs: HiddenTunesSong[],
  featuredSongs: HiddenTunesSong[],
  currentSong: { id?: string; title?: string; artist?: string; user?: { name?: string } } | null,
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
        currentSong.artist ||
        currentSong.user?.name ||
        match.artist ||
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
      subtitle: primary.artist || "Hidden Tunes",
      song: primary as unknown as HiddenTunesNormalizedSong,
      icon: "sparkles",
    });
  }

  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: "PICK",
      title: pick.title,
      subtitle: pick.artist || "Editor pick",
      song: pick as unknown as HiddenTunesNormalizedSong,
      icon: "cloud-done",
    });
  }

  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || "GENRE").toUpperCase(),
      title: genreSong.title,
      subtitle: genreSong.artist || "Genre spotlight",
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
        subtitle: recent.artist || recentSong.artist || "In rotation",
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

export default function MusicFeedScreen() {
  const { playSong } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const { recentlyPlayed, favorites, activeQueue } = usePlayerState();

  const [catalog, setCatalog] = useState<HiddenTunesDerivedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(CATALOG_PAGE_SIZE);
  const [showDeferredHomeSections, setShowDeferredHomeSections] = useState(false);
  const heroIndexRef = useRef(0);
  const heroListRef = useRef<FlatList<HeroCard> | null>(null);
  const { width: viewportWidth } = useWindowDimensions();
  const heroCardWidth = Math.min(520, Math.max(300, viewportWidth - 36));
  const heroCardHeight = Math.min(340, Math.max(268, Math.round(heroCardWidth * 0.78)));
  const railCardWidth = Math.min(244, Math.max(204, viewportWidth * 0.62));
  const searchPanelPadding = viewportWidth < 380 ? 12 : 14;

  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];
  const genres = catalog?.genres || [];
  const playlists = catalog?.playlists || [];

  const loadCatalog = useCallback(async () => {
    const cached = getCachedHiddenTunesCatalog();
    if (cached) {
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
    void loadCatalog();
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

  const visiblePlaylists = useMemo(() => playlists.slice(0, 6), [playlists]);
  const featuredSongs = useMemo(() => songs.slice(0, 8), [songs]);
  const moodGenreChips = useMemo(() => genres.slice(0, 4), [genres]);
  const recentlyAddedSongs = useMemo(
    () => (showDeferredHomeSections ? songs.slice(0, 12) : []),
    [showDeferredHomeSections, songs]
  );
  const moodRooms = useMemo(
    () => (showDeferredHomeSections ? buildMoodRooms(songs) : []),
    [showDeferredHomeSections, songs]
  );
  const openRooms = useMemo(
    () => (showDeferredHomeSections ? buildOpenRooms(songs) : []),
    [showDeferredHomeSections, songs]
  );
  const visibleArtists = useMemo(
    () => (showDeferredHomeSections ? artists.slice(0, 12) : []),
    [artists, showDeferredHomeSections]
  );
  const visibleAlbums = useMemo(
    () => (showDeferredHomeSections ? albums.slice(0, 12) : []),
    [albums, showDeferredHomeSections]
  );
  const visibleGenres = useMemo(
    () => (showDeferredHomeSections ? genres.slice(0, 10) : []),
    [genres, showDeferredHomeSections]
  );
  const visibleCatalogSongs = useMemo(() => songs.slice(0, visibleCatalogCount), [songs, visibleCatalogCount]);
  const canLoadMore = visibleCatalogCount < songs.length;

  const becauseYouListened = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    const recentArtists = new Set(
      (Array.isArray(recentlyPlayed) ? recentlyPlayed : [])
        .map((entry) => String(entry?.artist || "").toLowerCase())
        .filter(Boolean)
    );
    const favoriteArtists = new Set((favorites || []).map((song: any) => String(song.artist || "").toLowerCase()));
    const candidates = songs.filter((song) => {
      const artist = String(song.artist || "").toLowerCase();
      return recentArtists.has(artist) || favoriteArtists.has(artist);
    });
    return uniqSongs(candidates.length ? candidates : songs.slice(8, 24)).slice(0, 12);
  }, [favorites, recentlyPlayed, showDeferredHomeSections, songs]);

  const smartQueueSongs = useMemo(() => {
    if (!showDeferredHomeSections) return [];
    const queueSongs = Array.isArray(activeQueue) ? (activeQueue as HiddenTunesSong[]) : [];
    return uniqSongs((queueSongs.length ? queueSongs : songs.slice(12, 30)).filter(Boolean)).slice(0, 12);
  }, [activeQueue, showDeferredHomeSections, songs]);

  const heroCards = useMemo(
    () =>
      buildHeroCards(
        songs,
        featuredSongs,
        currentSong,
        Array.isArray(recentlyPlayed) ? recentlyPlayed : []
      ),
    [currentSong, featuredSongs, recentlyPlayed, songs]
  );

  useEffect(() => {
    if (heroCards.length <= 1) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setInterval(() => {
        setHeroIndex((current) => {
          const next = (current + 1) % heroCards.length;
          heroIndexRef.current = next;
          heroListRef.current?.scrollToIndex({ index: next, animated: true });
          return next;
        });
      }, 6500);
    });

    return () => {
      interaction.cancel();
      if (timer) clearInterval(timer);
    };
  }, [heroCards.length]);

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
    router.push({
      pathname: "/youtube-player",
      params: {
        videoId: video.source_id || video.id,
        title: video.title,
        channelTitle: video.channel_name || video.channelTitle || "Hidden Tunes TV",
        thumbnail: video.thumbnail_url || video.thumbnail || "",
      },
    } as any);
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
      if (card.isCurrent) {
        router.push("/player" as any);
        return;
      }

      playCatalogSong(card.song);
    },
    [playCatalogSong]
  );

  const handleHeroMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offset = event.nativeEvent.contentOffset.x || 0;
      const nextIndex = Math.max(
        0,
        Math.min(heroCards.length - 1, Math.round(offset / heroCardWidth))
      );
      heroIndexRef.current = nextIndex;
      setHeroIndex(nextIndex);
    },
    [heroCardWidth, heroCards.length]
  );

  const renderHeroCard = useCallback(
    ({ item, index }: { item: HeroCard; index: number }) => {
      const isPlayingCard =
        Boolean(currentSong) &&
        String(item.song?.id || "") === String(currentSong?.id || "");

      return (
        <View style={[styles.heroSlide, { width: heroCardWidth }]}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
            <PremiumHeroPressable
              height={heroCardHeight}
              isActive={isPlayingCard || index === heroIndexRef.current}
              onPress={() => handleHeroPress(item)}
            >
              <View style={styles.heroInner}>
                <View style={styles.heroTextBlock}>
                  <View style={styles.livePill}>
                    {isPlayingCard ? (
                      <NeonEQ isPlaying={isPlaying} size="small" />
                    ) : (
                      <Ionicons name={item.icon} size={13} color={COLORS.primary} />
                    )}
                    <Text style={styles.liveText}>
                      {isPlayingCard ? "Now Playing" : item.label}
                    </Text>
                  </View>

                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={styles.heroSong}
                  >
                    {item.title}
                  </Text>
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={styles.heroArtist}
                  >
                    {item.subtitle}
                  </Text>

                  <View style={styles.heroBottomRow}>
                    <View style={styles.heroPlayButton}>
                      <Ionicons
                        name={isPlayingCard && isPlaying ? "pause" : "play"}
                        size={18}
                        color="#000"
                      />
                      <Text style={styles.heroPlayText}>
                        {isPlayingCard ? "OPEN PLAYER" : "PLAY"}
                      </Text>
                    </View>

                    {heroCards.length > 1 ? (
                      <View style={styles.heroCountPill}>
                        <Text style={styles.heroCountText}>
                          {index + 1}/{heroCards.length}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.heroArtworkPanel}>
                  <PremiumLuxuryPulse style={styles.heroArtworkAura} />
                  <HTImage
                    source={item.song}
                    style={styles.heroArtworkImage}
                    contentFit="cover"
                    contentPosition="top"
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={["transparent", "rgba(0,0,0,0.42)"]}
                    style={styles.heroArtworkFade}
                  />
                </View>
              </View>
            </PremiumHeroPressable>
          </LinearGradient>
        </View>
      );
    },
    [currentSong?.id, handleHeroPress, heroCardHeight, heroCardWidth, heroCards.length, isPlaying]
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
        <PremiumAmbientGlow style={styles.glowPurple} color="rgba(168,85,247,0.14)" />
        <PremiumAmbientGlow style={styles.glowCyan} color="rgba(34,211,238,0.1)" />
        <PremiumAmbientGlow style={styles.glowCenter} color="rgba(168,85,247,0.08)" />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <PremiumLuxuryPulse style={styles.logoAura} />
              <Image
                source={require("../assets/images/logo.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>HIDDEN TUNES</Text>
              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
                For your mood
              </Text>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.subtitle}>
                Premium listening, curated for you
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.refreshButton} onPress={refreshCatalog}>
            <Ionicons name="refresh" size={22} color={COLORS.cyan} />
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

            <Text style={styles.emptyTitle}>Nothing here yet</Text>

            <Text style={styles.emptyText}>New releases will appear soon.</Text>
          </View>
        ) : (
          <FlatList
            data={visibleCatalogSongs}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
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
                  <Ionicons name="search" size={20} color={COLORS.cyan} />
                  <View style={styles.searchLauncherCopy}>
                    <Text style={styles.searchLauncherTitle}>Search Hidden Tunes</Text>
                    <Text style={styles.searchLauncherText}>Songs, artists, albums, lyrics</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>

                {heroCards.length > 0 ? (
                  <View style={styles.heroStage}>
                    <PremiumLuxuryPulse style={styles.heroStageGlow} />
                    <FlatList
                      ref={heroListRef}
                      horizontal
                      data={heroCards}
                      keyExtractor={(item) => item.key}
                      renderItem={renderHeroCard}
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={heroCardWidth}
                      decelerationRate="fast"
                      onMomentumScrollEnd={handleHeroMomentumEnd}
                      onScrollToIndexFailed={() => {}}
                      contentContainerStyle={styles.heroList}
                    />

                    {heroCards.length > 1 ? (
                      <View style={styles.heroDots}>
                        {heroCards.map((card, index) => (
                          <View
                            key={card.key}
                            style={[
                              styles.heroDot,
                              index === heroIndex && styles.heroDotActive,
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
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
                              <View pointerEvents="none" style={styles.roomShade} />
                              <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                              <Text style={styles.roomSubtitle}>{room.subtitle}</Text>
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
                            <View key={artist.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={artist.name}
                                subtitle={`${artist.songs.length} song${artist.songs.length === 1 ? "" : "s"}`}
                                image={artist}
                                rightIcon="person"
                                onPress={() => openArtist(artist)}
                                onRightPress={() => openArtist(artist)}
                              />
                            </View>
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
                            <View key={album.id} style={[styles.surfaceCardShell, { width: railCardWidth }]}>
                              <UnifiedMediaCard
                                title={album.title}
                                subtitle={`${album.songs.length} song${album.songs.length === 1 ? "" : "s"} / ${album.artist}`}
                                image={album}
                                rightIcon="albums"
                                onPress={() => openAlbum(album)}
                                onRightPress={() => openAlbum(album)}
                              />
                            </View>
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
                              <View pointerEvents="none" style={styles.roomShade} />
                              <Text numberOfLines={1} style={styles.roomTitle}>{room.title}</Text>
                              <Text style={styles.roomSubtitle}>{room.subtitle}</Text>
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
    paddingTop: 48,
    paddingHorizontal: 18,
  },
  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(34,211,238,0.06)",
  },
  glowCenter: {
    position: "absolute",
    top: 180,
    alignSelf: "center",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(168,85,247,0.045)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(34,211,238,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
  },
  title: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.heroTitle,
    fontWeight: "900",
    marginTop: 6,
    lineHeight: TYPOGRAPHY.heroTitle + 6,
  },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 6,
    fontSize: TYPOGRAPHY.metadata,
    fontWeight: "700",
    lineHeight: 20,
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
  list: { paddingBottom: 146 },
  heroStage: {
    marginBottom: SPACING.hero,
    position: "relative",
  },
  heroStageGlow: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
  },
  heroList: {
    paddingRight: 18,
  },
  heroSlide: {
    marginRight: 14,
  },
  heroBorder: {
    borderRadius: 28,
    padding: 1,
  },
  heroCard: {
    borderRadius: 27,
    overflow: "hidden",
    backgroundColor: COLORS.card,
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
  },
  heroTextBlock: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  heroArtworkPanel: {
    flex: 1,
    marginHorizontal: 14,
    marginBottom: 14,
    minHeight: 132,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    ...SHADOWS.artwork,
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
    marginBottom: 16,
  },
  liveText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  heroSong: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.heroTitle,
    fontWeight: "900",
    lineHeight: TYPOGRAPHY.heroTitle + 4,
    marginTop: 2,
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.heroSubtitle,
    fontWeight: "700",
    marginTop: 8,
    lineHeight: TYPOGRAPHY.heroSubtitle + 4,
  },
  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
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
  },
  listeningBrief: {
    marginBottom: 14,
    borderRadius: 22,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    marginBottom: 20,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchLauncherCopy: {
    flex: 1,
    minWidth: 0,
  },
  searchLauncherTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  searchLauncherText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
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
  cinematicSection: {
    marginBottom: SPACING.section,
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
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: "900",
    lineHeight: TYPOGRAPHY.sectionTitle + 4,
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
    gap: 11,
  },
  logoMark: {
    width: LOGO_SIZES.header,
    height: LOGO_SIZES.header,
    borderRadius: LOGO_SIZES.header / 2,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...SHADOWS.premium,
  },
  logoAura: {
    position: "absolute",
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: LOGO_SIZES.header / 2 + 8,
    overflow: "hidden",
  },
  logoImage: {
    width: LOGO_SIZES.headerImage,
    height: LOGO_SIZES.headerImage,
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
    marginTop: 2,
    marginBottom: 18,
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
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  quickText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  roomCard: {
    width: 186,
    height: 134,
    borderRadius: 22,
    overflow: "hidden",
    padding: 13,
    justifyContent: "flex-end",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  roomImage: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  roomShade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  roomTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    zIndex: 2,
  },
  roomSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    zIndex: 2,
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
