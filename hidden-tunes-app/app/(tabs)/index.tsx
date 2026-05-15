import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useScrollToTop } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import MediaCard from "../../components/MediaCard";
import NeonEQ from "../../components/NeonEQ";
import HTImage from "../../components/HTImage";
import LiveWaveform from "../../components/LiveWaveform";

import { COLORS, GRADIENTS } from "../../constants/theme";
import { usePlayer } from "../../context/PlayerContext";
import {
  refreshHiddenTunesSongs,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";

const { width } = Dimensions.get("window");
const FEATURED_CARD_WIDTH = width * 0.72;
const HERO_CARD_WIDTH = width - 40;
const INITIAL_HOME_SONG_ROWS = 24;
const HOME_SONG_ROWS_INCREMENT = 24;
const HERO_AUTO_SLIDE_MS = 7000;

type HeroCard = {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  song: HiddenTunesNormalizedSong;
  icon: keyof typeof Ionicons.glyphMap;
  isCurrent?: boolean;
};

function getSongImage(song: any) {
  return getArtworkUri(song, FALLBACK_ARTWORK);
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getSongImage(song);
  const streamUrl = String(song?.streamUrl || song?.url || song?.audioUrl || "");

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || "Hidden Tunes"),
    album: song?.album || "Singles",
    artwork,
    cover: artwork,
    url: String(song?.url || streamUrl),
    streamUrl,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
  } as HiddenTunesNormalizedSong;
}

function dedupeSongs(songs: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    const key = String(song.id || song.streamUrl || song.url).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(song.streamUrl || song.url);
  });
}

function HomeScreen() {
  const { playSong, currentSong, isPlaying, recentlyPlayed } = usePlayer() as any;

  const isLoadingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const heroListRef = useRef<FlatList<HeroCard>>(null);
  const heroIndexRef = useRef(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const heroScale = useRef(new Animated.Value(0.96)).current;
  const heroGlowAnim = useRef(new Animated.Value(0.42)).current;

  const [featuredSongs, setFeaturedSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleSongCount, setVisibleSongCount] = useState(INITIAL_HOME_SONG_ROWS);
  const [heroIndex, setHeroIndex] = useState(0);

  const defaultHeroTrack = featuredSongs[0];

  useScrollToTop(scrollRef);

  const loadFeaturedSongs = useCallback(async (showLoader = true) => {
    if (isLoadingRef.current) return;

    try {
      isLoadingRef.current = true;

      if (showLoader) setLoadingSongs(true);

      const songs = await refreshHiddenTunesSongs();
      setFeaturedSongs(dedupeSongs((songs || []).map(safeSong)));
      setVisibleSongCount(INITIAL_HOME_SONG_ROWS);
    } catch (error) {
      console.log("Load featured songs error:", error);
      setFeaturedSongs([]);
    } finally {
      isLoadingRef.current = false;
      setLoadingSongs(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFeaturedSongs(true);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.spring(heroScale, {
        toValue: 1,
        friction: 9,
        tension: 55,
        useNativeDriver: true,
      }),
    ]).start();

    const heroGlowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlowAnim, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(heroGlowAnim, {
          toValue: 0.42,
          duration: 2200,
          useNativeDriver: true,
        }),
      ])
    );

    heroGlowLoop.start();

    return () => {
      heroGlowLoop.stop();
    };
  }, [fadeAnim, heroGlowAnim, heroScale, loadFeaturedSongs, slideAnim]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeaturedSongs(false);
  }, [loadFeaturedSongs]);

  const newestSongs = useMemo(() => featuredSongs.slice(0, 12), [featuredSongs]);

  const visibleAllSongs = useMemo(
    () => featuredSongs.slice(0, visibleSongCount),
    [featuredSongs, visibleSongCount]
  );

  const hasMoreCloudSongs = visibleSongCount < featuredSongs.length;

  const afroSongs = useMemo(
    () =>
      featuredSongs
        .filter((song) =>
          `${song.genre || ""} ${song.mood || ""} ${song.title || ""}`
            .toLowerCase()
            .includes("afro")
        )
        .slice(0, 10),
    [featuredSongs]
  );

  const heroCards = useMemo<HeroCard[]>(() => {
    const cards: HeroCard[] = [];
    const firstGenreSong = featuredSongs.find((song) => Boolean(song.genre));
    const firstMoodSong = featuredSongs.find((song) => Boolean(song.mood));
    const hiddenTunesPick = featuredSongs[1] || defaultHeroTrack;
    const recentSong = Array.isArray(recentlyPlayed)
      ? recentlyPlayed.find((song: any) => song?.streamUrl || song?.url || song?.audioUrl)
      : null;

    if (currentSong) {
      const song = safeSong(currentSong);

      cards.push({
        key: `current-${song.id}`,
        label: "NOW PLAYING",
        title: song.title,
        subtitle: song.artist || "Hidden Tunes",
        song,
        icon: "pulse",
        isCurrent: true,
      });
    }

    if (defaultHeroTrack) {
      cards.push({
        key: `new-${defaultHeroTrack.id}`,
        label: "NEW UPLOAD",
        title: defaultHeroTrack.title,
        subtitle: defaultHeroTrack.artist || "Fresh from the cloud",
        song: defaultHeroTrack,
        icon: "cloud-done",
      });
    }

    if (hiddenTunesPick && hiddenTunesPick.id !== defaultHeroTrack?.id) {
      cards.push({
        key: `pick-${hiddenTunesPick.id}`,
        label: "HIDDEN TUNES PICK",
        title: hiddenTunesPick.title,
        subtitle: hiddenTunesPick.artist || "Editor pick",
        song: hiddenTunesPick,
        icon: "sparkles",
      });
    }

    if (firstGenreSong) {
      cards.push({
        key: `genre-${firstGenreSong.genre}-${firstGenreSong.id}`,
        label: String(firstGenreSong.genre || "GENRE").toUpperCase(),
        title: firstGenreSong.title,
        subtitle: firstGenreSong.artist || "Genre discovery",
        song: firstGenreSong,
        icon: "albums",
      });
    }

    if (firstMoodSong) {
      cards.push({
        key: `mood-${firstMoodSong.mood}-${firstMoodSong.id}`,
        label: `${String(firstMoodSong.mood || "Mood").toUpperCase()} MOOD`,
        title: firstMoodSong.title,
        subtitle: firstMoodSong.artist || "Mood discovery",
        song: firstMoodSong,
        icon: "radio",
      });
    }

    if (recentSong) {
      const song = safeSong(recentSong);

      cards.push({
        key: `recent-${song.id}`,
        label: "RECENTLY PLAYED",
        title: song.title,
        subtitle: song.artist || "Back in rotation",
        song,
        icon: "time",
      });
    }

    return cards.slice(0, 6);
  }, [currentSong, defaultHeroTrack, featuredSongs, recentlyPlayed]);

  const shouldAutoSlideHero =
    heroCards.length > 1 && !isPlaying;
  const firstHeroKey = heroCards[0]?.key;

  useEffect(() => {
    heroIndexRef.current = 0;
    setHeroIndex(0);
    heroListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [firstHeroKey]);

  useEffect(() => {
    if (!isPlaying || !currentSong || heroCards.length === 0) return;

    heroIndexRef.current = 0;
    setHeroIndex(0);

    heroListRef.current?.scrollToOffset({
      offset: 0,
      animated: true,
    });
  }, [currentSong, heroCards.length, isPlaying]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldAutoSlideHero) return undefined;

      const timer = setInterval(() => {
        const nextIndex = (heroIndexRef.current + 1) % heroCards.length;

        heroIndexRef.current = nextIndex;
        setHeroIndex(nextIndex);

        heroListRef.current?.scrollToOffset({
          offset: HERO_CARD_WIDTH * nextIndex,
          animated: true,
        });
      }, HERO_AUTO_SLIDE_MS);

      return () => {
        clearInterval(timer);
      };
    }, [heroCards.length, shouldAutoSlideHero])
  );

  const playFeaturedSong = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      const normalized = safeSong(song);
      const queue = dedupeSongs(featuredSongs.map(safeSong));

      const startIndex = Math.max(
        0,
        queue.findIndex((item) => item.id === normalized.id)
      );

      await playSong(normalized as any, queue as any, startIndex);
      router.push("/player" as any);
    },
    [featuredSongs, playSong]
  );

  const showMoreCloudSongs = useCallback(() => {
    setVisibleSongCount((current) =>
      Math.min(featuredSongs.length, current + HOME_SONG_ROWS_INCREMENT)
    );
  }, [featuredSongs.length]);

  const handleHeroPress = useCallback(
    (card: HeroCard) => {
      if (card.isCurrent) {
        router.push("/player" as any);
        return;
      }

      playFeaturedSong(card.song);
    },
    [playFeaturedSong]
  );

  const renderHeroCard = useCallback(
    ({ item, index }: { item: HeroCard; index: number }) => {
      const active = item.isCurrent || currentSong?.id === String(item.song.id);

      return (
        <View style={styles.heroSlide}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.heroCard}
              onPress={() => handleHeroPress(item)}
            >
              <HTImage uri={getSongImage(item.song)} style={styles.heroImage} />

              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.98)"]}
                style={styles.overlay}
              >
                <View style={styles.livePill}>
                  {active ? (
                    <NeonEQ isPlaying={isPlaying && item.isCurrent} size="small" />
                  ) : (
                    <Ionicons name={item.icon} size={13} color={COLORS.primary} />
                  )}

                  <Text style={styles.liveText}>{item.label}</Text>
                </View>

                <Text numberOfLines={1} style={styles.heroSong}>
                  {item.title}
                </Text>

                <Text numberOfLines={1} style={styles.heroArtist}>
                  {item.subtitle}
                </Text>

                {item.isCurrent && (
                  <View style={styles.heroWaveform}>
                    <LiveWaveform isPlaying={isPlaying} size="small" />
                  </View>
                )}

                <View style={styles.heroBottomRow}>
                  <View style={styles.playButton}>
                    <Ionicons
                      name={item.isCurrent && isPlaying ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.playText}>
                      {item.isCurrent ? "OPEN PLAYER" : "PLAY"}
                    </Text>
                  </View>

                  {heroCards.length > 1 && (
                    <View style={styles.heroCountPill}>
                      <Text style={styles.heroCountText}>
                        {index + 1}/{heroCards.length}
                      </Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      );
    },
    [currentSong?.id, handleHeroPress, heroCards.length, isPlaying]
  );

  const handleHeroMomentumEnd = useCallback((event: any) => {
    const offset = event.nativeEvent.contentOffset.x || 0;
    const nextIndex = Math.max(
      0,
      Math.min(heroCards.length - 1, Math.round(offset / HERO_CARD_WIDTH))
    );

    heroIndexRef.current = nextIndex;
    setHeroIndex(nextIndex);
  }, [heroCards.length]);

  const renderSongRow = useCallback(
    (song: HiddenTunesNormalizedSong, index: number) => {
      const active = currentSong?.id === String(song.id);

      return (
        <View
          key={`featured-row-${song.id}-${index}`}
          style={[styles.mediaShell, active && styles.mediaShellActive]}
        >
          <MediaCard
            title={song.title}
            subtitle={`${song.artist} • ${song.album || "Hidden Tunes"}`}
            image={getSongImage(song)}
            type="song"
            size="medium"
            showPlayButton={false}
            onPress={() => playFeaturedSong(song)}
          />

          <View style={styles.mediaAction}>
            {active ? (
              <NeonEQ isPlaying={isPlaying} size="small" />
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.rowPlayButton}
                onPress={() => playFeaturedSong(song)}
              >
                <Ionicons name="play" size={18} color="#000" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [currentSong?.id, isPlaying, playFeaturedSong]
  );

  const renderFeaturedItem = useCallback(
    ({ item, index }: { item: HiddenTunesNormalizedSong; index: number }) => {
      const active = currentSong?.id === String(item.id);

      return (
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.featuredCard, active && styles.featuredCardActive]}
          onPress={() => playFeaturedSong(item)}
        >
          <HTImage uri={getSongImage(item)} style={styles.featuredCover} />

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.96)"]}
            style={styles.featuredOverlay}
          />

          <View style={styles.featuredRank}>
            <Text style={styles.featuredRankText}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>

          <View style={styles.featuredContent}>
            <View style={styles.featuredBadge}>
              {active ? (
                <NeonEQ isPlaying={isPlaying} size="small" />
              ) : (
                <Ionicons name="cloud-done" size={13} color={COLORS.primary} />
              )}

              <Text style={styles.featuredBadgeText}>
                {active ? "NOW PLAYING" : "R2 CLOUD"}
              </Text>
            </View>

            <Text numberOfLines={1} style={styles.featuredTitle}>
              {item.title}
            </Text>

            <Text numberOfLines={1} style={styles.featuredArtist}>
              {item.artist}
            </Text>

            <View style={styles.featuredBottom}>
              <View style={styles.autoNextPill}>
                <Ionicons
                  name="play-skip-forward"
                  size={13}
                  color={COLORS.text}
                />
                <Text style={styles.autoNextText}>Auto-next ready</Text>
              </View>

              <View style={styles.featuredPlay}>
                <Ionicons
                  name={active && isPlaying ? "pause" : "play"}
                  size={18}
                  color="#000"
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [currentSong?.id, isPlaying, playFeaturedSong]
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <Animated.View
        style={[
          styles.animatedWrap,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              tintColor={COLORS.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <View style={styles.logoGlow} />
              <HTImage
                source={FALLBACK_ARTWORK}
                style={styles.logoImage}
                contentFit="cover"
              />
            </View>

            <View>
              <Text style={styles.logoText}>Hidden Tunes</Text>
              <Text style={styles.logoSub}>R2 Cloud Audio</Text>
            </View>

            <TouchableOpacity
              style={styles.searchButton}
              onPress={() => router.push("/search")}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.heroTitle}>Hidden Sound.</Text>

          <Text style={styles.heroSubtitle}>
            Your own cloud catalog. Fast playback. Premium discovery.
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.searchBar}
            onPress={() => router.push("/search")}
          >
            <Ionicons name="search" size={20} color={COLORS.cyan} />
            <Text style={styles.searchText}>Search your cloud music...</Text>
            <Ionicons name="sparkles" size={18} color={COLORS.primary} />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.heroOuter,
              {
                transform: [{ scale: heroScale }],
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.heroBoxGlow,
                {
                  opacity: heroGlowAnim,
                  transform: [
                    {
                      scale: heroGlowAnim.interpolate({
                        inputRange: [0.42, 1],
                        outputRange: [0.98, 1.035],
                      }),
                    },
                  ],
                },
              ]}
            />
            {heroCards.length > 0 ? (
              <FlatList
                ref={heroListRef}
                horizontal
                data={heroCards}
                keyExtractor={(item) => item.key}
                renderItem={renderHeroCard}
                showsHorizontalScrollIndicator={false}
                snapToInterval={HERO_CARD_WIDTH}
                decelerationRate="fast"
                pagingEnabled
                initialNumToRender={2}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews
                onMomentumScrollEnd={handleHeroMomentumEnd}
              />
            ) : (
              <LinearGradient colors={GRADIENTS.neon} style={styles.heroBorder}>
                <View style={styles.heroCard}>
                  <View style={styles.heroEmpty}>
                    <Ionicons name="cloud-upload" size={44} color={COLORS.primary} />
                    <Text style={styles.heroEmptyText}>No cloud track yet</Text>
                    <Text style={styles.heroEmptySub}>
                      Upload a song in Admin, then pull down to refresh.
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            )}
          </Animated.View>

          {heroCards.length > 1 && (
            <View style={styles.heroDots}>
              {heroCards.map((item, index) => (
                <View
                  key={`hero-dot-${item.key}`}
                  style={[
                    styles.heroDot,
                    index === heroIndex && styles.heroDotActive,
                  ]}
                />
              ))}
            </View>
          )}

          <View style={styles.catalogPill}>
            <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
            <Text style={styles.catalogPillText}>
              {featuredSongs.length} cloud songs loaded
            </Text>
          </View>

          <View style={styles.grid}>
            <PremiumCard
              icon="headset"
              title="Music"
              color={COLORS.primary}
              onPress={() => router.push("/music-feed" as any)}
            />

            <PremiumCard
              icon="search"
              title="Search"
              color={COLORS.cyan}
              onPress={() => router.push("/search")}
            />

            <PremiumCard
              icon="list"
              title="Queue"
              color={COLORS.pink}
              onPress={() => router.push("/queue")}
            />

            <PremiumCard
              icon="logo-youtube"
              title="TV"
              color="#ff0033"
              onPress={() => router.push("/youtube-feed" as any)}
            />
          </View>

          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionTitle}>Latest Uploads</Text>
              <Text style={styles.sectionSub}>
                Fresh songs from Supabase and Cloudflare R2
              </Text>
            </View>

            <TouchableOpacity onPress={onRefresh} style={styles.refreshMini}>
              <Ionicons name="refresh" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {loadingSongs ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading cloud songs...</Text>
            </View>
          ) : featuredSongs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No cloud tracks found</Text>
              <Text style={styles.emptyText}>
                Upload a song from the Admin screen, then refresh Home.
              </Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={newestSongs}
              keyExtractor={(item, index) => `slide-${item.id}-${index}`}
              showsHorizontalScrollIndicator={false}
              snapToInterval={FEATURED_CARD_WIDTH + 16}
              decelerationRate="fast"
              contentContainerStyle={styles.featuredSlider}
              renderItem={renderFeaturedItem}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              removeClippedSubviews
            />
          )}

          {afroSongs.length > 0 && (
            <>
              <View style={styles.sectionRowSmall}>
                <Text style={styles.sectionTitle}>Afro Cloud Picks</Text>
                <Text style={styles.sectionSub}>Afrobeat and Afro-fusion uploads</Text>
              </View>

              <View style={styles.mediaList}>
                {afroSongs.map((song, index) => renderSongRow(song, index))}
              </View>
            </>
          )}

          <View style={styles.sectionRowSmall}>
            <Text style={styles.sectionTitle}>All Cloud Songs</Text>
            <Text style={styles.sectionSub}>
              Showing {visibleAllSongs.length} of {featuredSongs.length} uploads
            </Text>
          </View>

          <View style={styles.mediaList}>
            {visibleAllSongs.map((song, index) => renderSongRow(song, index))}
          </View>

          {hasMoreCloudSongs && (
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.showMoreButton}
              onPress={showMoreCloudSongs}
            >
              <Ionicons name="albums-outline" size={18} color="#000" />
              <Text style={styles.showMoreText}>Show More Songs</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 140 }} />
        </ScrollView>
      </Animated.View>
    </LinearGradient>
  );
}

export default memo(HomeScreen);

const PremiumCard = memo(function PremiumCard({ icon, title, color, onPress }: any) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const pressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.gridCard}
        activeOpacity={0.88}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={[styles.iconCircle, { borderColor: color }]}>
          <Ionicons name={icon} size={23} color={color} />
        </View>

        <Text style={styles.gridTitle}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  animatedWrap: {
    flex: 1,
  },

  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.2)",
  },

  glowCyan: {
    position: "absolute",
    top: 250,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.12)",
  },

  scrollContent: {
    paddingBottom: 160,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.5)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 5,
    overflow: "hidden",
  },

  logoGlow: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(168,85,247,0.16)",
  },

  logoImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },

  logoText: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
    marginLeft: 14,
  },

  logoSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 14,
    marginTop: 3,
  },

  searchButton: {
    marginLeft: "auto",
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  heroTitle: {
    color: COLORS.text,
    fontSize: 46,
    fontWeight: "900",
    paddingHorizontal: 20,
    marginTop: 30,
    letterSpacing: -1.2,
  },

  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 20,
    marginTop: 10,
    fontWeight: "700",
  },

  searchBar: {
    marginTop: 22,
    marginHorizontal: 20,
    height: 54,
    borderRadius: 27,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
    flexDirection: "row",
    alignItems: "center",
  },

  searchText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 10,
  },

  heroOuter: {
    marginTop: 24,
    marginHorizontal: 20,
    position: "relative",
  },

  heroBoxGlow: {
    position: "absolute",
    left: -8,
    right: -8,
    top: -8,
    height: 334,
    borderRadius: 42,
    backgroundColor: "rgba(168,85,247,0.2)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 8,
  },

  heroDots: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.24)",
  },

  heroDotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
  },

  heroSlide: {
    width: HERO_CARD_WIDTH,
  },

  heroBorder: {
    height: 318,
    borderRadius: 34,
    padding: 2,
  },

  heroCard: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },

  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },

  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 24,
  },

  livePill: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },

  liveText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heroSong: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
  },

  heroArtist: {
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    fontWeight: "700",
  },

  heroWaveform: {
    height: 28,
    marginBottom: 18,
    overflow: "hidden",
  },

  heroEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },

  heroEmptyText: {
    color: COLORS.text,
    marginTop: 12,
    fontWeight: "900",
    fontSize: 18,
  },

  heroEmptySub: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },

  playButton: {
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },

  playText: {
    color: "#000",
    fontWeight: "900",
    marginLeft: 8,
  },

  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heroCountPill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroCountText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },

  catalogPill: {
    marginTop: 16,
    marginHorizontal: 20,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  catalogPillText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 20,
  },

  gridCard: {
    width: (width - 64) / 4,
    height: 88,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 22,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  gridTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },

  sectionRow: {
    marginTop: 32,
    marginBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionRowSmall: {
    marginTop: 28,
    marginBottom: 16,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    paddingHorizontal: 20,
  },

  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
    paddingHorizontal: 20,
  },

  refreshMini: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  loadingBox: {
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
    flexDirection: "row",
    alignItems: "center",
  },

  loadingText: {
    color: COLORS.textMuted,
    marginLeft: 10,
    fontWeight: "700",
  },

  emptyBox: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  emptyText: {
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 20,
  },

  featuredSlider: {
    paddingLeft: 20,
    paddingRight: 28,
  },

  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: 255,
    borderRadius: 32,
    marginRight: 16,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  featuredCardActive: {
    borderColor: "rgba(168,85,247,0.65)",
  },

  featuredCover: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },

  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  featuredRank: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.58)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },

  featuredRankText: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 13,
  },

  featuredContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
  },

  featuredBadge: {
    alignSelf: "flex-start",
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },

  featuredBadgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  featuredTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },

  featuredArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },

  featuredBottom: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  autoNextPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
  },

  autoNextText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 6,
  },

  featuredPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  mediaList: {
    paddingHorizontal: 20,
  },

  mediaShell: {
    position: "relative",
  },

  mediaShellActive: {
    borderRadius: 28,
    backgroundColor: "rgba(168,85,247,0.12)",
  },

  mediaAction: {
    position: "absolute",
    right: 16,
    top: 27,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  rowPlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  showMoreButton: {
    alignSelf: "center",
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },

  showMoreText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
