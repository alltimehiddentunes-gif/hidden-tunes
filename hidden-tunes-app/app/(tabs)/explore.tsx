import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useScrollToTop } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import AddToPlaylistButton from "../../components/AddToPlaylistButton";
import HTImage from "../../components/HTImage";
import { COLORS, GRADIENTS } from "../../constants/theme";
import { usePlayer } from "../../context/PlayerContext";
import { HIDDEN_TUNES_GENRES } from "../../utils/genres";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";

import {
  getTrendingYouTubeBackend,
  type BackendYouTubeTrack,
} from "../../services/youtubeBackend";

import {
  getHiddenTunesAlbums,
  getHiddenTunesArtists,
  getHiddenTunesCloudPlaylists,
  refreshHiddenTunesSongs,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesCloudPlaylist,
  type HiddenTunesNormalizedSong,
} from "../../services/hiddenTunesApi";

const MOODS = ["Afrobeats", "Amapiano", "Afro Soul", "Dancehall"];
const GENRE_PREVIEW_MS = 6800;

const GENRE_VIBES: Record<string, string> = {
  afrobeats: "Street energy",
  amapiano: "After-hours pulse",
  "afro-soul": "Velvet vocals",
  dancehall: "Island heat",
  hiphop: "Night drive",
  "hip-hop": "Night drive",
  rnb: "Late night",
  "r&b": "Late night",
  pop: "Bright hooks",
  electronic: "Neon motion",
  gospel: "Lifted spirit",
  reggae: "Warm breeze",
  soul: "Deep feeling",
  jazz: "Smoke room",
  rock: "Big stage",
};

type GenreItem = {
  id: string;
  title: string;
  query: string;
  emoji?: string;
};

type GenreWorld = GenreItem & {
  vibe: string;
  preview: string[];
  artwork: string[];
};

const CARD_WIDTH = 150;
const CARD_GAP = 14;
const ARTIST_CARD_WIDTH = 142;

function getSafeVideoId(track: BackendYouTubeTrack) {
  return String(track.videoId || track.id || "").replace("youtube-", "").trim();
}

function getSongArtwork(song: any) {
  return getArtworkUri(song, FALLBACK_ARTWORK);
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getSongArtwork(song);
  const streamUrl = String(
    song?.streamUrl ||
      song?.url ||
      song?.audioUrl ||
      song?.audio_url ||
      song?.previewUrl ||
      ""
  );

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || song?.user?.name || "Hidden Tunes"),
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

function normalizeGenreKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getGenreVibe(genre: GenreItem) {
  const key = normalizeGenreKey(`${genre.id || ""} ${genre.title || ""} ${genre.query || ""}`);

  for (const [match, vibe] of Object.entries(GENRE_VIBES)) {
    if (key.includes(match)) return vibe;
  }

  return "Curated world";
}

const CloudSongCard = memo(function CloudSongCard({
  song,
  badge,
  onPress,
}: {
  song: HiddenTunesNormalizedSong;
  badge: "R2" | "RECENT" | "SMART";
  onPress: (song: HiddenTunesNormalizedSong, badge: "R2" | "RECENT" | "SMART") => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.cloudCard}
      onPress={() => onPress(song, badge)}
    >
      <HTImage uri={getSongArtwork(song)} style={styles.cloudCover} />

      <Text numberOfLines={1} style={styles.cloudTitle}>
        {song.title}
      </Text>

      <Text numberOfLines={1} style={styles.cloudArtist}>
        {song.artist}
      </Text>

      <View style={badge === "SMART" ? styles.smartBadge : styles.cloudBadge}>
        <Ionicons
          name={
            badge === "SMART"
              ? "sparkles"
              : badge === "RECENT"
              ? "time"
              : "cloud-done"
          }
          size={12}
          color="#000"
        />
        <Text style={styles.cloudBadgeText}>{badge}</Text>
      </View>

      {badge !== "SMART" && (
        <View style={styles.addButtonWrap}>
          <AddToPlaylistButton track={song as any} />
        </View>
      )}
    </TouchableOpacity>
  );
});

const YouTubeTrackCard = memo(function YouTubeTrackCard({
  item,
  index,
  onPress,
}: {
  item: BackendYouTubeTrack;
  index: number;
  onPress: (track: BackendYouTubeTrack) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.trackCard}
      onPress={() => onPress(item)}
    >
      <Text style={styles.rank}>{String(index + 2).padStart(2, "0")}</Text>

      <HTImage
        uri={item.thumbnail || item.artwork || FALLBACK_ARTWORK}
        style={styles.cover}
      />

      <View style={styles.info}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.title}
        </Text>

        <Text style={styles.artist} numberOfLines={1}>
          {item.artist || item.channelTitle || "YouTube"}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons name="logo-youtube" size={13} color="#ff3b30" />
          <Text style={styles.metaText}>YouTube fallback</Text>
        </View>
      </View>

      <View style={styles.playCircle}>
        <Ionicons name="play" size={16} color={COLORS.text} />
      </View>
    </TouchableOpacity>
  );
});

export default function ExploreScreen() {
  const {
    playSong,
    currentSong,
    recentlyPlayed,
    smartAutoplayEnabled,
    toggleSmartAutoplay,
  } = usePlayer() as any;

  const listRef = useRef<FlatList<BackendYouTubeTrack>>(null);

  const [tracks, setTracks] = useState<BackendYouTubeTrack[]>([]);
  const [cloudSongs, setCloudSongs] = useState<HiddenTunesNormalizedSong[]>([]);
  const [albums, setAlbums] = useState<HiddenTunesAlbum[]>([]);
  const [artists, setArtists] = useState<HiddenTunesArtist[]>([]);
  const [playlists, setPlaylists] = useState<HiddenTunesCloudPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showHeavySections, setShowHeavySections] = useState(false);
  const [genrePreviewIndex, setGenrePreviewIndex] = useState(0);

  useScrollToTop(listRef);

  const loadSecondarySections = useCallback(async (forceRefresh = false) => {
    try {
      const [albumResults, artistResults, playlistResults, youtubeResults] =
        await Promise.allSettled([
          getHiddenTunesAlbums({ forceRefresh }),
          getHiddenTunesArtists({ forceRefresh }),
          getHiddenTunesCloudPlaylists(),
          getTrendingYouTubeBackend(),
        ]);

      setAlbums(
        albumResults.status === "fulfilled" && Array.isArray(albumResults.value)
          ? albumResults.value.slice(0, 10)
          : []
      );

      setArtists(
        artistResults.status === "fulfilled" && Array.isArray(artistResults.value)
          ? artistResults.value.slice(0, 10)
          : []
      );

      setPlaylists(
        playlistResults.status === "fulfilled" && Array.isArray(playlistResults.value)
          ? playlistResults.value.slice(0, 8)
          : []
      );

      setTracks(
        youtubeResults.status === "fulfilled" && Array.isArray(youtubeResults.value)
          ? youtubeResults.value.slice(0, 10)
          : []
      );
    } catch (error) {
      console.log("Explore secondary load error:", error);
    } finally {
      setShowHeavySections(true);
    }
  }, []);

  const loadExplore = useCallback(
    async (showLoader = true, forceRefresh = false) => {
      try {
        if (showLoader) setLoading(true);

        const songResults = await refreshHiddenTunesSongs();

        const nextSongs = Array.isArray(songResults)
          ? dedupeSongs(songResults.map(safeSong))
          : [];

        setCloudSongs(nextSongs);
        setLoading(false);
        setRefreshing(false);

        InteractionManager.runAfterInteractions(() => {
          loadSecondarySections(forceRefresh);
        });
      } catch (error) {
        console.log("Explore load error:", error);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadSecondarySections]
  );

  useEffect(() => {
    loadExplore(true, false);
  }, [loadExplore]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setShowHeavySections(false);
    await loadExplore(false, true);
  }, [loadExplore]);

  const featured = tracks[0];

  const listTracks = useMemo(() => tracks.slice(1, 7), [tracks]);

  const visibleCloudSongs = useMemo(() => cloudSongs.slice(0, 18), [cloudSongs]);

  const continueSongs = useMemo(() => {
    const mappedRecent = Array.isArray(recentlyPlayed)
      ? recentlyPlayed.map(safeSong)
      : [];

    return dedupeSongs([...mappedRecent, ...cloudSongs]).slice(0, 10);
  }, [recentlyPlayed, cloudSongs]);

  const smartPicks = useMemo(() => {
    if (!cloudSongs.length) return [];

    const recentText = Array.isArray(recentlyPlayed)
      ? recentlyPlayed
          .slice(0, 8)
          .map(
            (item: any) =>
              `${item.title || ""} ${item.artist || ""} ${item.genre || ""} ${
                item.mood || ""
              }`
          )
          .join(" ")
          .toLowerCase()
      : "";

    return cloudSongs
      .map((song: any) => {
        const text = `${song.title || ""} ${song.artist || ""} ${
          song.genre || ""
        } ${song.mood || ""} ${song.album || ""}`.toLowerCase();

        let score = 0;

        if (recentText.includes(String(song.artist || "").toLowerCase())) score += 5;
        if (song.genre && recentText.includes(song.genre.toLowerCase())) score += 4;
        if (song.mood && recentText.includes(song.mood.toLowerCase())) score += 4;
        if (text.includes("afro")) score += 3;
        if (text.includes("amapiano")) score += 3;
        if (text.includes("soul")) score += 2;
        if (text.includes("emotional")) score += 2;
        if (text.includes("love")) score += 1;

        return { song, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.song)
      .slice(0, 10);
  }, [cloudSongs, recentlyPlayed]);

  const genreWorlds = useMemo<GenreWorld[]>(() => {
    return HIDDEN_TUNES_GENRES.map((genre) => {
      const genreItem = genre as GenreItem;
      const genreText = `${genreItem.id || ""} ${genreItem.title || ""} ${
        genreItem.query || ""
      }`.toLowerCase();

      const relatedSongs = cloudSongs.filter((song) => {
        const songText = `${song.title || ""} ${song.artist || ""} ${
          song.genre || ""
        } ${song.mood || ""} ${song.album || ""}`.toLowerCase();

        return genreText
          .split(/[^a-z0-9]+/)
          .filter(Boolean)
          .some((token) => token.length > 2 && songText.includes(token));
      });

      const relatedArtists = artists.filter((artist: any) => {
        const artistText = `${artist.name || ""} ${artist.genre || ""}`.toLowerCase();
        return genreText
          .split(/[^a-z0-9]+/)
          .filter(Boolean)
          .some((token) => token.length > 2 && artistText.includes(token));
      });

      const artwork = relatedSongs
        .slice(0, 3)
        .map((song) => getSongArtwork(song))
        .filter(Boolean);

      const preview = [
        ...relatedSongs
          .slice(0, 3)
          .map((song) => `${song.artist || "Hidden Tunes"} - ${song.title}`),
        ...relatedArtists
          .slice(0, 2)
          .map((artist: any) => `${artist.name || "Artist"} radio`),
      ].filter(Boolean);

      return {
        ...genreItem,
        vibe: getGenreVibe(genreItem),
        preview:
          preview.length > 0
            ? preview
            : [`${genreItem.title} discoveries`, "Fresh catalog energy"],
        artwork,
      };
    });
  }, [artists, cloudSongs]);

  useFocusEffect(
    useCallback(() => {
      if (genreWorlds.length === 0) return undefined;

      const timer = setInterval(() => {
        setGenrePreviewIndex((current) => current + 1);
      }, GENRE_PREVIEW_MS);

      return () => {
        clearInterval(timer);
      };
    }, [genreWorlds.length])
  );

  const openGenre = useCallback((genre: GenreItem) => {
    router.push({
      pathname: "/genre",
      params: {
        id: genre.id,
        title: genre.title,
        query: genre.query,
      },
    } as any);
  }, []);

  const openMood = useCallback((mood: string) => {
    router.push({
      pathname: "/genre",
      params: {
        id: mood.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: mood,
        query: `${mood} music`,
      },
    } as any);
  }, []);

  const openYouTubeTrack = useCallback((track: BackendYouTubeTrack) => {
    const videoId = getSafeVideoId(track);
    if (!videoId) return;

    router.push({
      pathname: "/youtube-player",
      params: {
        id: videoId,
        videoId,
        title: track.title,
        artist: track.artist,
        channelTitle: track.channelTitle,
        thumbnail: track.thumbnail,
      },
    } as any);
  }, []);

  const openCloudSong = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      try {
        const normalized = safeSong(song);
        const baseQueue = dedupeSongs(cloudSongs.map(safeSong));
        const queueHasSong = baseQueue.some((item) => item.id === normalized.id);
        const queue = queueHasSong
          ? baseQueue
          : dedupeSongs([normalized, ...baseQueue]);

        const startIndex = Math.max(
          0,
          queue.findIndex((item) => item.id === normalized.id)
        );

        await playSong(normalized as any, queue as any, startIndex);
        router.push("/player" as any);
      } catch (error) {
        console.log("Open cloud song error:", error);
      }
    },
    [cloudSongs, playSong]
  );

  const openSmartPick = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      try {
        const smartQueue = dedupeSongs(
          (smartPicks.length > 0 ? smartPicks : cloudSongs).map(safeSong)
        );

        const normalized = safeSong(song);

        const startIndex = Math.max(
          0,
          smartQueue.findIndex((item) => item.id === normalized.id)
        );

        await playSong(normalized as any, smartQueue as any, startIndex);
        router.push("/player" as any);
      } catch (error) {
        console.log("Open smart pick error:", error);
      }
    },
    [cloudSongs, playSong, smartPicks]
  );

  const resumeCurrentSong = useCallback(async () => {
    if (!currentSong) return;

    try {
      const normalized = safeSong(currentSong);
      const queue = dedupeSongs(cloudSongs.map(safeSong));

      const startIndex = Math.max(
        0,
        queue.findIndex((item) => item.id === normalized.id)
      );

      await playSong(normalized as any, queue as any, startIndex);
      router.push("/player" as any);
    } catch (error) {
      console.log("Resume song error:", error);
      router.push("/player" as any);
    }
  }, [cloudSongs, currentSong, playSong]);

  const handleCloudCardPress = useCallback(
    (song: HiddenTunesNormalizedSong, badge: "R2" | "RECENT" | "SMART") => {
      if (badge === "SMART") {
        openSmartPick(song);
      } else {
        openCloudSong(song);
      }
    },
    [openCloudSong, openSmartPick]
  );

  const renderSmartPick = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <CloudSongCard song={item} badge="SMART" onPress={handleCloudCardPress} />
    ),
    [handleCloudCardPress]
  );

  const renderRecentSong = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <CloudSongCard song={item} badge="RECENT" onPress={handleCloudCardPress} />
    ),
    [handleCloudCardPress]
  );

  const renderCloudSong = useCallback(
    ({ item }: { item: HiddenTunesNormalizedSong }) => (
      <CloudSongCard song={item} badge="R2" onPress={handleCloudCardPress} />
    ),
    [handleCloudCardPress]
  );

  const renderYouTubeTrack = useCallback(
    ({ item, index }: { item: BackendYouTubeTrack; index: number }) => (
      <YouTubeTrackCard item={item} index={index} onPress={openYouTubeTrack} />
    ),
    [openYouTubeTrack]
  );

  const getCloudItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_WIDTH + CARD_GAP,
      offset: (CARD_WIDTH + CARD_GAP) * index,
      index,
    }),
    []
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        ref={listRef}
        data={listTracks}
        keyExtractor={(item, index) => `${item.videoId || item.id || "track"}-${index}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            tintColor={COLORS.primary}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        removeClippedSubviews
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        updateCellsBatchingPeriod={70}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.kicker}>EXPLORE</Text>
                <Text style={styles.heading}>Hidden Tunes</Text>
              </View>

              <TouchableOpacity
                style={styles.refreshButton}
                onPress={onRefresh}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.smartHero}>
              <View style={styles.smartHeroGlow} />

              <View style={styles.smartHeroTop}>
                <View style={styles.smartHeroIcon}>
                  <Ionicons name="infinite" size={26} color={COLORS.primary} />
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.smartHeroToggle,
                    smartAutoplayEnabled && styles.smartHeroToggleActive,
                  ]}
                  onPress={toggleSmartAutoplay}
                >
                  <Text
                    style={[
                      styles.smartHeroToggleText,
                      smartAutoplayEnabled && styles.smartHeroToggleTextActive,
                    ]}
                  >
                    Smart {smartAutoplayEnabled ? "On" : "Off"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.smartHeroTitle}>Your premium cloud music engine</Text>

              <Text style={styles.smartHeroSubtitle}>
                R2 playback, Supabase catalog, smart picks, playlists and endless
                queue continuation.
              </Text>

              <View style={styles.smartHeroActions}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[
                    styles.smartHeroPrimary,
                    !cloudSongs.length && styles.disabledButton,
                  ]}
                  onPress={() => {
                    const first = smartPicks[0] || cloudSongs[0];
                    if (first) openSmartPick(first);
                  }}
                  disabled={!cloudSongs.length}
                >
                  <Ionicons name="play" size={17} color="#000" />
                  <Text style={styles.smartHeroPrimaryText}>Play Smart Picks</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.smartHeroSecondary}
                  onPress={() => router.push("/playlists" as any)}
                >
                  <Ionicons name="albums" size={18} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>

            {currentSong && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Continue Listening</Text>
                    <Text style={styles.sectionSub}>
                      Jump back into your current stream
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/player" as any)}>
                    <Text style={styles.seeAll}>Player</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.continueCard}
                  onPress={resumeCurrentSong}
                >
                  <HTImage uri={getSongArtwork(currentSong)} style={styles.continueImage} />

                  <View style={styles.continueInfo}>
                    <Text style={styles.continueKicker}>NOW PLAYING</Text>

                    <Text numberOfLines={1} style={styles.continueTitle}>
                      {currentSong.title || "Unknown Song"}
                    </Text>

                    <Text numberOfLines={1} style={styles.continueArtist}>
                      {currentSong.artist ||
                        currentSong.user?.name ||
                        currentSong.channelTitle ||
                        "Hidden Tunes"}
                    </Text>
                  </View>

                  <View style={styles.continuePlay}>
                    <Ionicons name="play" size={18} color="#000" />
                  </View>
                </TouchableOpacity>
              </>
            )}

            <FlatList
              horizontal
              data={MOODS}
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.chip}
                  activeOpacity={0.85}
                  onPress={() => openMood(item)}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </TouchableOpacity>
              )}
            />

            {loading ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading explore catalog...</Text>
              </View>
            ) : null}

            {!loading && cloudSongs.length > 0 && (
              <View style={styles.catalogStats}>
                <Ionicons name="cloud-done" size={16} color={COLORS.primary} />
                <Text style={styles.catalogStatsText}>
                  {cloudSongs.length} cloud songs loaded from Hidden Tunes
                </Text>
              </View>
            )}

            {smartPicks.length > 0 && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Smart Picks</Text>
                    <Text style={styles.sectionSub}>
                      Based on your catalog and listening
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/queue" as any)}>
                    <Text style={styles.seeAll}>Queue</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={smartPicks}
                  keyExtractor={(item) => `smart-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  renderItem={renderSmartPick}
                  getItemLayout={getCloudItemLayout}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews
                />
              </>
            )}

            {continueSongs.length > 0 && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Recently Played</Text>
                    <Text style={styles.sectionSub}>
                      Quick access to your latest songs
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/recently-played" as any)}>
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={continueSongs}
                  keyExtractor={(item) => `recent-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  renderItem={renderRecentSong}
                  getItemLayout={getCloudItemLayout}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews
                />
              </>
            )}

            {visibleCloudSongs.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Hidden Tunes Cloud</Text>
                  <Text style={styles.sectionSub}>Your latest R2/Supabase uploads</Text>
                </View>

                <FlatList
                  horizontal
                  data={visibleCloudSongs}
                  keyExtractor={(item) => `cloud-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  renderItem={renderCloudSong}
                  getItemLayout={getCloudItemLayout}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews
                />
              </>
            )}

            <View style={styles.genreHeader}>
              <Text style={styles.sectionTitle}>Genre Worlds</Text>
              <Text style={styles.sectionSub}>Curated destinations from your catalog</Text>
            </View>

            <View style={styles.genreGrid}>
              {genreWorlds.map((genre, index) => {
                const preview =
                  genre.preview[genrePreviewIndex % genre.preview.length] ||
                  `${genre.title} discoveries`;
                const primaryArtwork = genre.artwork[0] || FALLBACK_ARTWORK;
                const secondaryArtwork = genre.artwork[1] || primaryArtwork;
                const tertiaryArtwork = genre.artwork[2] || secondaryArtwork;

                return (
                <TouchableOpacity
                  key={genre.id}
                  activeOpacity={0.86}
                  style={[
                    styles.genreWorldCard,
                    index % 2 === 1 && styles.genreWorldCardAlt,
                  ]}
                  onPress={() => openGenre(genre as GenreItem)}
                >
                  <View style={styles.genreWorldGlow} />
                  <View style={styles.genreAccentLine} />

                  <View style={styles.genreArtworkStack}>
                    <HTImage
                      uri={tertiaryArtwork}
                      style={[styles.genreArtwork, styles.genreArtworkBack]}
                    />
                    <HTImage
                      uri={secondaryArtwork}
                      style={[styles.genreArtwork, styles.genreArtworkMid]}
                    />
                    <HTImage uri={primaryArtwork} style={styles.genreArtwork} />
                  </View>

                  <View style={styles.genreWorldTop}>
                    <View style={styles.genreIndexBadge}>
                      <Text style={styles.genreIndexText}>
                        {String(index + 1).padStart(2, "0")}
                      </Text>
                    </View>
                    <View style={styles.genreVibePill}>
                      <Text numberOfLines={1} style={styles.genreVibeText}>
                        {genre.vibe}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.genreWorldContent}>
                    <Text numberOfLines={1} style={styles.genreTitle}>
                      {genre.title}
                    </Text>

                    <Text numberOfLines={1} style={styles.genrePreview}>
                      {preview}
                    </Text>
                  </View>

                  <View style={styles.genreCtaRow}>
                    <Text style={styles.genreCtaText}>Explore vibe</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
                );
              })}
            </View>

            {showHeavySections && playlists.length > 0 && (
              <>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Cloud Playlists</Text>
                    <Text style={styles.sectionSub}>Auto-built from your catalog</Text>
                  </View>

                  <TouchableOpacity onPress={() => router.push("/cloud-playlists" as any)}>
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={playlists}
                  keyExtractor={(item: any) => `playlist-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  renderItem={({ item }: any) => (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.cloudCard}
                      onPress={() =>
                        router.push({
                          pathname: "/cloud-playlist/[id]",
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <HTImage uri={getSongArtwork(item)} style={styles.cloudCover} />

                      <Text numberOfLines={1} style={styles.cloudTitle}>
                        {item.title || item.name || "Playlist"}
                      </Text>

                      <Text numberOfLines={1} style={styles.cloudArtist}>
                        {Array.isArray(item.tracks)
                          ? `${item.tracks.length} tracks`
                          : "Cloud playlist"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            {showHeavySections && albums.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Cloud Albums</Text>
                  <Text style={styles.sectionSub}>Real albums from your catalog</Text>
                </View>

                <FlatList
                  horizontal
                  data={albums}
                  keyExtractor={(item: any) => `album-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  renderItem={({ item }: any) => (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.cloudCard}
                      onPress={() =>
                        router.push({
                          pathname: "/album/[id]",
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <HTImage uri={getSongArtwork(item)} style={styles.cloudCover} />

                      <Text numberOfLines={1} style={styles.cloudTitle}>
                        {item.title || item.name || "Album"}
                      </Text>

                      <Text numberOfLines={1} style={styles.cloudArtist}>
                        {item.artist || "Hidden Tunes"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            {showHeavySections && artists.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Cloud Artists</Text>
                  <Text style={styles.sectionSub}>Artist pages and discography</Text>
                </View>

                <FlatList
                  horizontal
                  data={artists}
                  keyExtractor={(item: any) => `artist-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cloudRow}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  getItemLayout={(_, index) => ({
                    length: ARTIST_CARD_WIDTH + CARD_GAP,
                    offset: (ARTIST_CARD_WIDTH + CARD_GAP) * index,
                    index,
                  })}
                  renderItem={({ item }: any) => (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.artistCloudCard}
                      onPress={() =>
                        router.push({
                          pathname: "/artist/[id]",
                          params: { id: item.id },
                        } as any)
                      }
                    >
                      <HTImage uri={getSongArtwork(item)} style={styles.artistCloudImage} />

                      <Text numberOfLines={1} style={styles.cloudTitle}>
                        {item.name || "Artist"}
                      </Text>

                      <Text numberOfLines={1} style={styles.cloudArtist}>
                        {Array.isArray(item.tracks)
                          ? `${item.tracks.length} songs`
                          : item.genre || "Hidden Tunes"}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            {showHeavySections && !loading && featured ? (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => openYouTubeTrack(featured)}
                style={styles.heroWrap}
              >
                <HTImage
                  uri={featured.thumbnail || featured.artwork || FALLBACK_ARTWORK}
                  style={styles.heroImage}
                />

                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.92)"]}
                  style={styles.heroOverlay}
                />

                <View style={styles.heroBadge}>
                  <Ionicons name="flame" size={14} color="#ffcc66" />
                  <Text style={styles.heroBadgeText}>Fallback discovery</Text>
                </View>

                <View style={styles.heroContent}>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {featured.title}
                  </Text>

                  <Text style={styles.heroArtist} numberOfLines={1}>
                    {featured.artist || featured.channelTitle || "YouTube"}
                  </Text>

                  <View style={styles.heroAction}>
                    <Ionicons name="play" size={18} color="#000" />
                    <Text style={styles.heroActionText}>Open video</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : null}

            {!loading && !featured && !cloudSongs.length ? (
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={58} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No Songs Loaded</Text>
                <Text style={styles.emptyText}>Upload a song, then pull down to refresh.</Text>
              </View>
            ) : null}

            {showHeavySections && !loading && tracks.length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Hot right now</Text>
                <Text style={styles.sectionSub}>YouTube fallback discovery</Text>
              </View>
            )}
          </>
        }
        renderItem={renderYouTubeTrack}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingTop: 68,
    paddingHorizontal: 20,
    paddingBottom: 165,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heading: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 4,
  },
  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border || "rgba(255,255,255,0.12)",
  },
  smartHero: {
    marginTop: 24,
    borderRadius: 34,
    padding: 22,
    minHeight: 230,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  smartHeroGlow: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  smartHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smartHeroIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  smartHeroToggle: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  smartHeroToggleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  smartHeroToggleText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  smartHeroToggleTextActive: {
    color: "#000",
  },
  smartHeroTitle: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 20,
    letterSpacing: -0.7,
  },
  smartHeroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  smartHeroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  smartHeroPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  disabledButton: {
    opacity: 0.45,
  },
  smartHeroPrimaryText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
  },
  smartHeroSecondary: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    gap: 10,
    paddingTop: 22,
    paddingBottom: 22,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  catalogStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  catalogStatsText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  rowHeader: {
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  seeAll: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 24,
  },
  continueImage: {
    width: 78,
    height: 78,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  continueInfo: {
    flex: 1,
    marginLeft: 14,
  },
  continueKicker: {
    color: COLORS.primary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "900",
    marginBottom: 6,
  },
  continueTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  continueArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  continuePlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudRow: {
    gap: CARD_GAP,
    paddingBottom: 28,
    paddingRight: 20,
  },
  cloudCard: {
    width: CARD_WIDTH,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  artistCloudCard: {
    width: ARTIST_CARD_WIDTH,
    alignItems: "center",
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cloudCover: {
    width: "100%",
    height: 126,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  artistCloudImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  cloudTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  cloudArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  cloudBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  cloudBadgeText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    marginLeft: 4,
  },
  smartBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addButtonWrap: {
    position: "absolute",
    top: 14,
    right: 14,
  },
  genreHeader: {
    marginTop: 4,
    marginBottom: 14,
  },
  genreGrid: {
    gap: 14,
    marginBottom: 28,
  },
  genreWorldCard: {
    width: "100%",
    minHeight: 184,
    borderRadius: 32,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.058)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "space-between",
    overflow: "hidden",
    shadowColor: "#A855F7",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 4,
  },
  genreWorldCardAlt: {
    borderColor: "rgba(34,211,238,0.13)",
  },
  genreWorldGlow: {
    position: "absolute",
    right: -74,
    top: -76,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(168,85,247,0.14)",
  },
  genreAccentLine: {
    position: "absolute",
    left: 0,
    top: 24,
    bottom: 24,
    width: 2,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    opacity: 0.72,
  },
  genreWorldTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  genreArtworkStack: {
    position: "absolute",
    right: 18,
    top: 34,
    width: 126,
    height: 116,
  },
  genreArtwork: {
    position: "absolute",
    right: 0,
    top: 8,
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  genreArtworkMid: {
    right: 20,
    top: 4,
    opacity: 0.62,
    transform: [{ rotate: "-7deg" }],
  },
  genreArtworkBack: {
    right: 40,
    top: 0,
    opacity: 0.28,
    transform: [{ rotate: "-13deg" }],
  },
  genreIndexBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  genreIndexText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  genreVibePill: {
    maxWidth: 150,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  genreVibeText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  genreWorldContent: {
    marginTop: 40,
    paddingRight: 118,
    zIndex: 2,
  },
  genreTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  genrePreview: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 8,
  },
  genreCtaRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 0,
    paddingVertical: 4,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
    zIndex: 2,
  },
  genreCtaText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },
  loader: {
    height: 190,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 14,
    fontSize: 14,
  },
  heroWrap: {
    height: 320,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 30,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBadge: {
    position: "absolute",
    top: 18,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 6,
  },
  heroContent: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 22,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
  },
  heroArtist: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginTop: 8,
  },
  heroAction: {
    marginTop: 18,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  heroActionText: {
    color: "#000",
    fontWeight: "900",
    marginLeft: 8,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 26,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  rank: {
    width: 30,
    color: "rgba(255,255,255,0.32)",
    fontSize: 15,
    fontWeight: "900",
  },
  cover: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  trackTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },
  playCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    height: 340,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 18,
  },
  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
  },
});
