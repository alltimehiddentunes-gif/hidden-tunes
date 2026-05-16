import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayer } from "../context/PlayerContext";

import {
  getHiddenTunesSongsPage,
  type HiddenTunesNormalizedSong,
} from "../services/hiddenTunesApi";
import { FALLBACK_ARTWORK } from "../utils/artwork";

type AlbumPreview = {
  id: string;
  album: string;
  artist: string;
  thumbnail: string;
  query: string;
};

function getArtwork(song: any) {
  return (
    song?.artwork ||
    song?.cover ||
    song?.thumbnail ||
    song?.image ||
    FALLBACK_ARTWORK
  );
}

function cleanGenreQuery(value: string) {
  return String(value || "")
    .replace(/\s+music$/i, "")
    .replace(/\s+songs$/i, "")
    .trim();
}

function normalizeText(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getGenreAliases(value: string) {
  const clean = normalizeText(cleanGenreQuery(value));

  const aliasMap: Record<string, string[]> = {
    afrobeats: ["afrobeats", "afrobeat", "afro beat", "afro beats", "afro"],
    afrobeat: ["afrobeat", "afrobeats", "afro beat", "afro beats", "afro"],
    amapiano: ["amapiano", "piano"],
    "afro soul": ["afro soul", "afrosoul", "soul", "afro"],
    afrosoul: ["afro soul", "afrosoul", "soul", "afro"],
    dancehall: ["dancehall", "dance hall"],
  };

  return Array.from(
    new Set([clean, ...(aliasMap[clean] || []), clean.replace(/\s+/g, "")])
  ).filter(Boolean);
}

function songMatchesGenre(song: any, aliases: string[]) {
  const haystack = normalizeText(
    [
      song?.title,
      song?.artist,
      song?.album,
      song?.genre,
      song?.mood,
      song?.tags,
      song?.description,
    ].join(" ")
  );

  return aliases.some((alias) => {
    const safeAlias = normalizeText(alias);
    return safeAlias && haystack.includes(safeAlias);
  });
}

function safeSong(song: any): HiddenTunesNormalizedSong {
  const artwork = getArtwork(song);
  const streamUrl = String(song?.streamUrl || song?.url || song?.audioUrl || "");

  return {
    ...song,
    id: String(song?.id || `${song?.title || "song"}-${song?.artist || "artist"}`),
    title: String(song?.title || "Unknown Song"),
    artist: String(song?.artist || song?.user?.name || "Hidden Tunes"),
    album: song?.album || "Singles",
    artwork,
    cover: artwork,
    thumbnail: artwork,
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

export default function GenreScreen() {
  const params = useLocalSearchParams();
  const { playSong } = usePlayer() as any;

  const title = String(params.title || "Genre");
  const rawQuery = String(params.query || title || "music");
  const query = cleanGenreQuery(rawQuery);
  const genreId = String(params.id || "");

  const [cloudTracks, setCloudTracks] = useState<HiddenTunesNormalizedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const aliases = useMemo(() => {
    return Array.from(
      new Set([
        ...getGenreAliases(query),
        ...getGenreAliases(title),
        ...getGenreAliases(genreId),
      ])
    ).filter(Boolean);
  }, [query, title, genreId]);

  const loadGenreTracks = useCallback(async () => {
    try {
      setLoading(true);

      const genrePage = await getHiddenTunesSongsPage({
        page: 1,
        limit: 30,
        genre: query,
      });
      const combinedSongs = genrePage.songs
        .map(safeSong)
        .filter((song) => songMatchesGenre(song, aliases));

      setCloudTracks(dedupeSongs(combinedSongs));
      setPage(1);
      setHasMore(genrePage.hasMore);
    } catch (error) {
      console.log("Genre load error:", error);
      setCloudTracks([]);
    } finally {
      setLoading(false);
    }
  }, [aliases, query]);

  const loadMoreTracks = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);

      const nextPage = page + 1;
      const genrePage = await getHiddenTunesSongsPage({
        page: nextPage,
        limit: 30,
        genre: query,
      });
      const combinedSongs = genrePage.songs
        .map(safeSong)
        .filter((song) => songMatchesGenre(song, aliases));

      const nextTracks = dedupeSongs([...cloudTracks, ...combinedSongs]);

      setCloudTracks(nextTracks);
      setPage(nextPage);
      setHasMore(genrePage.hasMore);
    } catch (error) {
      console.log("Genre load more error:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [aliases, cloudTracks, hasMore, loadingMore, page, query]);

  useEffect(() => {
    loadGenreTracks();
  }, [loadGenreTracks]);

  const albums: AlbumPreview[] = useMemo(() => {
    return cloudTracks.slice(0, 8).map((song, index) => ({
      id: `${song.albumId || song.album || "album"}-${index}`,
      album: song.album || `${song.artist} Essentials`,
      artist: song.artist || "Hidden Tunes",
      thumbnail: getArtwork(song),
      query: `${song.album || song.artist} songs`,
    }));
  }, [cloudTracks]);

  const openCloudTrack = useCallback(
    async (song: HiddenTunesNormalizedSong) => {
      try {
        const queue = dedupeSongs(cloudTracks.map(safeSong));
        const normalized = safeSong(song);

        const startIndex = Math.max(
          0,
          queue.findIndex((item) => item.id === normalized.id)
        );

        await playSong(normalized as any, queue as any, startIndex);
        router.push("/player" as any);
      } catch (error) {
        console.log("Open genre cloud song error:", error);
      }
    },
    [cloudTracks, playSong]
  );

  function openAlbum(album: AlbumPreview) {
    router.push({
      pathname: "/album",
      params: {
        album: album.album,
        artist: album.artist,
        thumbnail: album.thumbnail,
        query: album.query,
      },
    } as any);
  }

  function openRadio() {
    router.push({
      pathname: "/radio",
      params: {
        title: `${title} Radio`,
        query,
      },
    } as any);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>GENRE</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            A room built around this feeling
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadGenreTracks}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={21} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Finding {title} songs...</Text>
        </View>
      ) : (
        <FlatList
          data={cloudTracks}
          keyExtractor={(item: any, index) =>
            `${item.id || item.videoId || "track"}-${index}`
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMoreTracks}
          onEndReachedThreshold={0.45}
          ListHeaderComponent={
            <>
              <View style={styles.radioCard}>
                <View style={styles.radioIcon}>
                  <Ionicons name="radio" size={28} color={COLORS.primary} />
                </View>

                <View style={styles.radioInfo}>
                  <Text style={styles.radioTitle}>{title} Listening Room</Text>
                  <Text style={styles.radioSubtitle} numberOfLines={1}>
                    Keep the {title} feeling moving
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.radioButton}
                  onPress={openRadio}
                >
                  <Ionicons name="play" size={17} color="#000" />
                  <Text style={styles.radioButtonText}>Start</Text>
                </TouchableOpacity>
              </View>

              {albums.length > 0 && (
                <View style={styles.albumSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Releases In This Mood</Text>
                    <Text style={styles.sectionSub}>
                      Albums and projects connected to this vibe
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.albumRow}
                  >
                    {albums.map((album) => (
                      <TouchableOpacity
                        key={album.id}
                        activeOpacity={0.86}
                        style={styles.albumCard}
                        onPress={() => openAlbum(album)}
                      >
                        <Image
                          source={{ uri: album.thumbnail }}
                          style={styles.albumCover}
                        />

                        <Text style={styles.albumTitle} numberOfLines={2}>
                          {album.album}
                        </Text>

                        <Text style={styles.albumArtist} numberOfLines={1}>
                          {album.artist}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Songs In This Room</Text>
                <Text style={styles.sectionSub}>
                  Tracks carrying the {title} feeling
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="musical-notes-outline"
                size={58}
                color={COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>No songs in this room yet</Text>
              <Text style={styles.emptyText}>
                Try another mood or refresh the catalog.
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadMoreText}>Loading more...</Text>
              </View>
            ) : hasMore ? (
              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.loadMoreButton}
                onPress={loadMoreTracks}
              >
                <Ionicons name="albums-outline" size={17} color="#000" />
                <Text style={styles.loadMoreButtonText}>Load more {title}</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item, index }: any) => {
            const artwork = getArtwork(item);

            return (
              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.trackCard}
                onPress={() => openCloudTrack(item as HiddenTunesNormalizedSong)}
              >
                <Text style={styles.rank}>
                  {String(index + 1).padStart(2, "0")}
                </Text>

                <Image source={{ uri: artwork }} style={styles.cover} />

                <View style={styles.info}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {item.title || "Unknown Song"}
                  </Text>

                  <Text style={styles.artist} numberOfLines={1}>
                    {item.artist || "Unknown Artist"}
                  </Text>

                  <View style={styles.metaRow}>
                    <Ionicons
                      name="cloud-done"
                      size={13}
                      color={COLORS.primary}
                    />
                    <Text style={styles.metaText}>Hidden Tunes</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 12,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 3,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 14,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 165,
  },
  radioCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 28,
    marginBottom: 30,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  radioIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  radioInfo: { flex: 1 },
  radioTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  radioSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  radioButtonText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 5,
  },
  albumSection: { marginBottom: 30 },
  sectionHeader: { marginBottom: 16 },
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
  albumRow: {
    gap: 14,
    paddingRight: 20,
  },
  albumCard: { width: 145 },
  albumCover: {
    width: 145,
    height: 145,
    borderRadius: 26,
    backgroundColor: COLORS.card,
  },
  albumTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 10,
    lineHeight: 18,
  },
  albumArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
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
    height: 420,
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
    textAlign: "center",
  },
  loadMoreFooter: {
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  loadMoreText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  loadMoreButton: {
    alignSelf: "center",
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 22,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadMoreButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
