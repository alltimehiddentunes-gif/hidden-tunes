import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { safeRouterBack } from "../utils/safeNavigation";

import HTImage from "../components/HTImage";
import AppShell from "../components/navigation/AppShell";
import PremiumEmptyState from "../components/PremiumEmptyState";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  getListPerformanceSettings,
  markFastScrolling,
} from "../utils/performanceMode";
import { usePlayerActions } from "../context/PlayerContext";
import { resolveEntityArtwork } from "../utils/artwork";
import {
  logEntityArtworkResolved,
  logEntityTapReceived,
} from "../utils/entityDiagnostics";
import {
  type HiddenTunesAlbumCatalogItem,
  type HiddenTunesSong,
} from "../services/hiddenTunes";
import {
  getInstantCatalogView,
  loadCatalogView,
} from "../services/unifiedCatalog";
import { useLocalization } from "@/localization";
import { RELATED_SONGS_LABEL } from "@/utils/entityResolution";

function clean(value: string) {
  return String(value || "").trim().toLowerCase();
}

function getSongDurationSeconds(song: HiddenTunesSong) {
  const raw = (song as any).raw || {};
  const value = (song as any).duration ?? (song as any).durationSeconds ?? raw.duration ?? raw.durationSeconds;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 10000 ? Math.round(parsed / 1000) : Math.round(parsed);
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "Hidden Tunes";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function GenreScreen() {
  const params = useLocalSearchParams();
  const { playSong } = usePlayerActions();
  const { t } = useLocalization();

  const title = String(params.title || params.query || "Genre");
  const displayTitle =
    String(params.title || params.query || "").trim() ||
    t("music.genre.fallbackGenre");
  const isMood = String(params.type || "genre") === "mood";

  const musicUi = useMemo(
    () => ({
      station: t("music.genre.station"),
      room: t("music.genre.room"),
      genreRoom: t("music.genre.genreRoom"),
      moodRoom: t("music.genre.moodRoom"),
      radioStation: t("music.genre.radioStation"),
      moodRoomTag: t("music.genre.moodRoomTag"),
      startRadio: t("music.genre.startRadio"),
      featured: t("music.genre.featured"),
      featuredSubtitle: t("music.genre.featuredSubtitle"),
      albums: t("music.genre.albums"),
      albumsSubtitle: t("music.genre.albumsSubtitle"),
      artistsInRoom: t("music.genre.artistsInRoom"),
      artistsSubtitle: t("music.genre.artistsSubtitle"),
      songs: t("music.common.songs"),
      relatedSongs: t("music.common.relatedSongs"),
      songsTaggedInCatalog: t("music.common.songsTaggedInCatalog"),
      refresh: t("music.common.refresh"),
      loadingNamed: (name: string) => t("music.common.loadingNamed", { name }),
      emptyTitle: t("music.genre.emptyTitle"),
      emptyDescription: t("music.genre.emptyDescription"),
      formatSongs: (count: number) =>
        count === 1
          ? t("music.counts.oneSong", { count })
          : t("music.counts.songs", { count }),
      formatArtists: (count: number) =>
        count === 1
          ? t("music.counts.oneArtist", { count })
          : t("music.counts.artists", { count }),
      formatReleases: (count: number) =>
        count === 1
          ? t("music.counts.oneRelease", { count })
          : t("music.counts.releases", { count }),
      formatTracks: (count: number) =>
        count === 1
          ? t("music.counts.oneTrack", { count })
          : t("music.counts.tracks", { count }),
      heroMeta: (songCount: number, artistCount: number, releaseCount: number) =>
        t("music.counts.genreHeroMeta", {
          songs:
            songCount === 1
              ? t("music.counts.oneSong", { count: songCount })
              : t("music.counts.songs", { count: songCount }),
          artists:
            artistCount === 1
              ? t("music.counts.oneArtist", { count: artistCount })
              : t("music.counts.artists", { count: artistCount }),
          releases:
            releaseCount === 1
              ? t("music.counts.oneRelease", { count: releaseCount })
              : t("music.counts.releases", { count: releaseCount }),
        }),
      sectionTitle: (recoveryLabel?: string) =>
        recoveryLabel === RELATED_SONGS_LABEL
          ? t("music.common.relatedSongs")
          : recoveryLabel || t("music.common.songs"),
      sectionSubtitle: (recoveryLabel: string | undefined, trackCount: number) => {
        if (recoveryLabel === RELATED_SONGS_LABEL) {
          return trackCount === 1
            ? t("music.counts.relatedSongsFromCatalog", { count: trackCount })
            : t("music.counts.relatedSongsFromCatalogPlural", { count: trackCount });
        }
        return trackCount === 1
          ? t("music.counts.songsFound", { count: trackCount })
          : t("music.counts.songsFoundPlural", { count: trackCount });
      },
    }),
    [t]
  );
  const CATALOG_PAGE_LIMIT = 30;
  const MAX_HELD_TRACKS = 150;
  const [tracks, setTracks] = useState<HiddenTunesSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextPageRef = useRef(2);
  const focusedRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const catalogOptions = useMemo(
    () => ({
      type: String(params.type || "genre") as "genre" | "mood",
      id: String(params.id || ""),
      title,
      query: String(params.query || title),
      limit: CATALOG_PAGE_LIMIT,
    }),
    [params.id, params.query, params.type, title]
  );

  useEffect(() => {
    logEntityTapReceived(String(params.type || "genre") === "mood" ? "mood" : "genre", {
      title,
      id: String(params.id || ""),
      type: String(params.type || "genre"),
    });
  }, [params.id, params.type, title]);

  const loadFirstPage = useCallback(async (refresh = false) => {
    const generation = ++loadGenerationRef.current;
    const cached = getInstantCatalogView({ ...catalogOptions, page: 1 });

    if (cached?.songs.length) {
      const cachedTracks = cached.songs.slice(0, MAX_HELD_TRACKS) as HiddenTunesSong[];
      setTracks(cachedTracks);
      setHasMore(cached.hasMore && cachedTracks.length < MAX_HELD_TRACKS);
      nextPageRef.current = 2;
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const result = await loadCatalogView({
        ...catalogOptions,
        page: 1,
        forceRefresh: refresh,
      });
      if (!focusedRef.current || generation !== loadGenerationRef.current) return;

      const firstPage = result.songs.slice(0, MAX_HELD_TRACKS) as HiddenTunesSong[];
      setTracks(firstPage);
      setHasMore(result.hasMore && firstPage.length < MAX_HELD_TRACKS);
      nextPageRef.current = 2;
    } catch (error) {
      if (!focusedRef.current || generation !== loadGenerationRef.current) return;
      console.log("Genre catalog load error:", error);
      if (!cached?.songs.length) {
        setTracks([]);
        setHasMore(false);
      }
    } finally {
      if (focusedRef.current && generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [catalogOptions]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        // Ignore in-flight first-page and pagination responses after blur.
        loadGenerationRef.current += 1;
        setLoadingMore(false);
      };
    }, [])
  );

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function onRefresh() {
    setRefreshing(true);
    await loadFirstPage(true);
  }

  const loadMore = useCallback(async () => {
    if (!focusedRef.current || !hasMore || loadingMore || loading || tracks.length >= MAX_HELD_TRACKS) {
      return;
    }

    const generation = loadGenerationRef.current;
    const page = nextPageRef.current;
    setLoadingMore(true);
    try {
      const result = await loadCatalogView({ ...catalogOptions, page });
      if (!focusedRef.current || generation !== loadGenerationRef.current) return;

      setTracks((previous) => {
        const seen = new Set(previous.map((song) => String(song.id)));
        const appended = result.songs.filter((song) => !seen.has(String(song.id))) as HiddenTunesSong[];
        const merged = [...previous, ...appended].slice(0, MAX_HELD_TRACKS);
        const reachedCap = merged.length >= MAX_HELD_TRACKS;
        setHasMore(result.hasMore && !reachedCap);
        return merged;
      });
      nextPageRef.current = page + 1;
    } catch (error) {
      if (focusedRef.current && generation === loadGenerationRef.current) {
        console.log("Genre catalog pagination error:", error);
      }
    } finally {
      if (focusedRef.current && generation === loadGenerationRef.current) {
        setLoadingMore(false);
      }
    }
  }, [catalogOptions, hasMore, loading, loadingMore, tracks.length]);

  const listPerformance = useMemo(
    () => getListPerformanceSettings(tracks.length),
    [tracks.length]
  );
  const recoveryLabel = undefined;

  const albums = useMemo<HiddenTunesAlbumCatalogItem[]>(() => {
    const byAlbum = new Map<string, HiddenTunesAlbumCatalogItem>();
    tracks.forEach((song) => {
      const albumTitle = String(song.album || "").trim();
      if (!albumTitle) return;
      const artist = String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes";
      const key = `${clean(albumTitle)}:${clean(artist)}`;
      const existing = byAlbum.get(key);
      if (existing) {
        existing.songs.push(song);
        return;
      }
      byAlbum.set(key, {
        id: String((song as any).albumId || key),
        title: albumTitle,
        artist,
        artwork: song.artwork || song.cover || song.thumbnail || "",
        songs: [song],
      });
    });
    return Array.from(byAlbum.values()).slice(0, 12);
  }, [tracks]);

  const artists = useMemo(() => {
    const seen = new Map<string, { name: string; songCount: number; artworkSource: HiddenTunesSong }>();
    tracks.forEach((song) => {
      const name = String(song.artist || (song as any).user?.name || "Hidden Tunes").trim();
      if (!name) return;
      const key = clean(name);
      const existing = seen.get(key);
      if (existing) {
        existing.songCount += 1;
      } else {
        seen.set(key, { name, songCount: 1, artworkSource: song });
      }
    });
    return Array.from(seen.values()).slice(0, 12);
  }, [tracks]);

  const heroArtwork = useMemo(
    () => resolveEntityArtwork({ title, genre: title, mood: title }, tracks),
    [title, tracks]
  );

  useEffect(() => {
    logEntityArtworkResolved({
      kind: String(params.type || "genre") === "mood" ? "mood" : "genre",
      title,
      trackCount: tracks.length,
      hasArtwork: Boolean(heroArtwork),
    });
  }, [heroArtwork, params.type, title, tracks.length]);

  const featuredSongs = useMemo(() => tracks.slice(0, 6), [tracks]);

  function handlePlaySong(song: HiddenTunesSong, queueIndex: number) {
    void playSong(song, tracks, queueIndex, {
      source: String(params.type || "genre") === "mood" ? "mood" : "genre",
      label: title,
      genre: String(params.type || "genre") === "mood" ? song.genre : title,
      mood: String(params.type || "genre") === "mood" ? title : song.mood,
    });
  }

  function startRadioSession() {
    const first = tracks[0];
    if (!first) return;
    void playSong(first, tracks, 0, {
      source: String(params.type || "genre") === "mood" ? "mood" : "genre",
      label: title,
      genre: String(params.type || "genre") === "mood" ? first.genre : title,
      mood: String(params.type || "genre") === "mood" ? title : first.mood,
    });
  }

  function openArtist(name: string) {
    router.push({ pathname: "/artist", params: { artist: name } } as any);
  }

  function openAlbum(album: HiddenTunesAlbumCatalogItem) {
    router.push({
      pathname: "/album",
      params: { album: album.title, artist: album.artist, thumbnail: album.artwork },
    } as any);
  }

  return (
    <AppShell>
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View pointerEvents="none" style={styles.glowPurple} />
      <View pointerEvents="none" style={styles.glowCyan} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => safeRouterBack("/music-feed")} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>{isMood ? musicUi.room : musicUi.station}</Text>
          <Text style={styles.title} numberOfLines={1}>{displayTitle}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{musicUi.songsTaggedInCatalog}</Text>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.85}>
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{musicUi.loadingNamed(displayTitle)}</Text>
        </View>
      ) : (
        <FlatList
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onScrollEndDrag={() => markFastScrolling(false)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          data={tracks}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={listPerformance.initialNumToRender}
          maxToRenderPerBatch={listPerformance.maxToRenderPerBatch}
          windowSize={listPerformance.windowSize}
          updateCellsBatchingPeriod={listPerformance.updateCellsBatchingPeriod}
          removeClippedSubviews={listPerformance.removeClippedSubviews}
          refreshControl={<RefreshControl tintColor={COLORS.primary} refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <>
              <LinearGradient colors={GRADIENTS.card} style={styles.hero}>
                <View style={styles.heroArtworkWrap}>
                  <HTImage
                    source={{ title, genre: title, mood: title, artwork: heroArtwork }}
                    candidates={tracks}
                    style={styles.heroArtwork}
                    contentFit="cover"
                  />
                </View>
                <View style={styles.roomBadge}>
                  <Ionicons name={String(params.type || "genre") === "mood" ? "sparkles" : "radio"} size={13} color={COLORS.primaryGlow} />
                  <Text style={styles.roomBadgeText}>{isMood ? musicUi.moodRoom : musicUi.genreRoom}</Text>
                </View>
                <Text style={styles.heroTitle} numberOfLines={2}>{displayTitle}</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>
                  {musicUi.heroMeta(tracks.length, artists.length, albums.length)}
                </Text>
                <View style={styles.tagRow}>
                  <Text style={styles.tagPill}>{isMood ? musicUi.moodRoomTag : musicUi.radioStation}</Text>
                  <Text style={styles.tagPill}>{musicUi.formatTracks(tracks.length)}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[styles.playButton, tracks.length === 0 && styles.disabledButton]}
                  disabled={tracks.length === 0}
                  onPress={startRadioSession}
                >
                  <Ionicons name="radio" size={18} color="#000" />
                  <Text style={styles.playButtonText}>{musicUi.startRadio}</Text>
                </TouchableOpacity>
              </LinearGradient>

              {featuredSongs.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{musicUi.featured}</Text>
                    <Text style={styles.sectionSub}>{musicUi.featuredSubtitle}</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                    {featuredSongs.map((song, index) => (
                      <TouchableOpacity key={`${song.id}-${index}`} activeOpacity={0.86} style={styles.albumCard} onPress={() => handlePlaySong(song, index)}>
                        <HTImage source={song} style={styles.albumCover} contentFit="cover" />
                        <Text style={styles.albumTitle} numberOfLines={2}>{song.title}</Text>
                        <Text style={styles.albumArtist} numberOfLines={1}>{song.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {albums.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{musicUi.albums}</Text>
                    <Text style={styles.sectionSub}>{musicUi.albumsSubtitle}</Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                    {albums.map((album) => (
                      <TouchableOpacity key={album.id} activeOpacity={0.86} style={styles.albumCard} onPress={() => openAlbum(album)}>
                        <HTImage source={album} style={styles.albumCover} contentFit="cover" />
                        <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
                        <Text style={styles.albumArtist} numberOfLines={1}>{album.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {artists.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{musicUi.artistsInRoom}</Text>
                    <Text style={styles.sectionSub}>{musicUi.artistsSubtitle}</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
                    {artists.map((artist) => (
                      <TouchableOpacity key={artist.name} activeOpacity={0.86} style={styles.artistCard} onPress={() => openArtist(artist.name)}>
                        <HTImage source={artist.artworkSource} candidates={tracks} style={styles.artistImage} contentFit="cover" />
                        <Text style={styles.albumTitle} numberOfLines={1}>{artist.name}</Text>
                        <Text style={styles.albumArtist} numberOfLines={1}>{musicUi.formatSongs(artist.songCount)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{musicUi.sectionTitle(recoveryLabel)}</Text>
                <Text style={styles.sectionSub}>
                  {musicUi.sectionSubtitle(recoveryLabel, tracks.length)}
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <PremiumEmptyState
                icon="sparkles-outline"
                title={musicUi.emptyTitle}
                message={musicUi.emptyDescription}
                actionLabel={musicUi.refresh}
                onAction={onRefresh}
              />
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMore}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const duration = getSongDurationSeconds(item);

            return (
            <TouchableOpacity activeOpacity={0.86} style={styles.trackCard} onPress={() => handlePlaySong(item, index)}>
              <HTImage source={item} style={styles.cover} contentFit="cover" />
              <View style={styles.info}>
                <Text numberOfLines={1} style={styles.trackTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.trackArtist}>{item.artist}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="pricetag" size={13} color={COLORS.primaryGlow} />
                  <Text style={styles.metaText}>{duration ? formatDuration(duration) : item.genre || item.mood || "Hidden Tunes"}</Text>
                </View>
              </View>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color={COLORS.text} />
              </View>
            </TouchableOpacity>
            );
          }}
        />
      )}
    </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowPurple: { position: "absolute", top: 30, left: -125, width: 290, height: 290, borderRadius: 145, backgroundColor: "rgba(168,85,247,0.18)" },
  glowCyan: { position: "absolute", top: 340, right: -150, width: 330, height: 330, borderRadius: 165, backgroundColor: "rgba(34,211,238,0.1)" },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  headerText: { flex: 1 },
  kicker: { color: COLORS.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", marginTop: 2 },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  listContent: { paddingHorizontal: 18, paddingBottom: 150 },
  hero: { alignItems: "center", borderRadius: 30, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", overflow: "hidden", marginBottom: 24 },
  heroArtworkWrap: { width: 186, height: 186, borderRadius: 32, padding: 4, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  heroArtwork: { width: "100%", height: "100%", borderRadius: 28, backgroundColor: "rgba(168,85,247,0.1)" },
  roomBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.075)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginTop: 18 },
  roomBadgeText: { color: COLORS.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  heroTitle: { color: COLORS.text, fontSize: 30, fontWeight: "900", textAlign: "center", marginTop: 10, lineHeight: 35 },
  heroSubtitle: { color: COLORS.textMuted, fontSize: 13, fontWeight: "700", marginTop: 10, textAlign: "center", lineHeight: 19 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  tagPill: { color: COLORS.textMuted, fontSize: 11, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  playButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, gap: 8, marginTop: 18 },
  disabledButton: { opacity: 0.45 },
  playButtonText: { color: "#000", fontSize: 14, fontWeight: "900" },
  albumSection: { marginBottom: 10 },
  sectionHeader: { marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 19, fontWeight: "900" },
  sectionSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  albumRow: { gap: 12, paddingBottom: 8 },
  albumCard: { width: 132 },
  artistCard: { width: 124, alignItems: "center" },
  artistImage: { width: 98, height: 98, borderRadius: 49, backgroundColor: "rgba(168,85,247,0.1)", marginBottom: 8 },
  albumCover: { width: 126, height: 126, borderRadius: 18, marginBottom: 8, backgroundColor: "rgba(168,85,247,0.1)" },
  albumTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  albumArtist: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
  trackCard: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, padding: 10, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)" },
  cover: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.card },
  info: { flex: 1, minWidth: 0 },
  trackTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  trackArtist: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 },
  metaText: { color: COLORS.textMuted, fontSize: 11, fontWeight: "800" },
  playCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  empty: { alignItems: "center", paddingVertical: 42, paddingHorizontal: 4 },
  loadMore: { paddingVertical: 20, alignItems: "center" },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
});
