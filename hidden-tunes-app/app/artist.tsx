import { useEffect, useMemo, useState } from "react";
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

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";

import {
  searchYouTubeBackend,
  BackendYouTubeTrack,
} from "../services/youtubeBackend";
import {
  extractHiddenTunesArtists,
  getHiddenTunesArtists,
  getHiddenTunesCatalogSnapshot,
} from "../services/hiddenTunesApi";
import {
  canOpenArtistProfileById,
  resolveArtistFromList,
} from "../utils/artistIdentity";
import { FALLBACK_ARTWORK } from "../utils/artwork";

type AlbumPreview = {
  id: string;
  album: string;
  artist: string;
  thumbnail: string;
  query: string;
};

export default function ArtistScreen() {
  const params = useLocalSearchParams();

  const artist = String(params.artist || "Unknown Artist");
  const query = String(params.query || `${artist} songs`);

  const [tracks, setTracks] = useState<BackendYouTubeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingCatalog, setResolvingCatalog] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolveCanonicalArtist() {
      setResolvingCatalog(true);
      try {
        const memorySongs = getHiddenTunesCatalogSnapshot();
        const memoryArtists = memorySongs.length
          ? extractHiddenTunesArtists(memorySongs)
          : [];
        const artists =
          memoryArtists.length > 0
            ? memoryArtists
            : await getHiddenTunesArtists({ forceRefresh: false });
        if (cancelled) return;

        const match = resolveArtistFromList(artists, artist);
        if (match?.id && canOpenArtistProfileById(match.id)) {
          router.replace({
            pathname: "/artist/[id]",
            params: { id: String(match.id) },
          } as any);
          return;
        }
      } catch {
        // Keep YouTube legacy profile when catalog resolve fails or is ambiguous.
      } finally {
        if (!cancelled) setResolvingCatalog(false);
      }
    }

    void resolveCanonicalArtist();
    return () => {
      cancelled = true;
    };
  }, [artist]);

  useEffect(() => {
    if (resolvingCatalog) return;
    loadArtistTracks();
  }, [query, resolvingCatalog]);

  async function loadArtistTracks() {
    try {
      setLoading(true);

      const results = await searchYouTubeBackend(query);
      setTracks(Array.isArray(results) ? results : []);
    } catch (error) {
      console.log("Artist load error:", error);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }

  const artistImage = useMemo(() => {
    const firstTrackWithImage = tracks.find((item) => item.thumbnail);
    return firstTrackWithImage?.thumbnail || FALLBACK_ARTWORK;
  }, [tracks]);

  const albums: AlbumPreview[] = useMemo(() => {
    return tracks.slice(0, 8).map((track, index) => {
      const safeThumbnail = track.thumbnail || artistImage || FALLBACK_ARTWORK;

      return {
        id: `${track.id || "artist-track"}-album-${index}`,
        album: `${artist} Essentials`,
        artist,
        thumbnail: safeThumbnail,
        query: `${artist} album songs`,
      };
    });
  }, [tracks, artist, artistImage]);

  function openTrack(track: BackendYouTubeTrack) {
    router.push({
      pathname: "/youtube-player",
      params: {
        id: track.id || "",
        videoId: track.id || "",
        title: track.title || "Unknown Song",
        artist: track.artist || artist || "Unknown Artist",
        thumbnail: track.thumbnail || artistImage || FALLBACK_ARTWORK,
      },
    });
  }

  function openAlbum(album: AlbumPreview) {
    router.push({
      pathname: "/album",
      params: {
        album: album.album,
        artist: album.artist,
        thumbnail: album.thumbnail,
        query: album.query,
      },
    });
  }

  function playTopSong() {
    if (tracks[0]) {
      openTrack(tracks[0]);
    }
  }

  function openEssentialsAlbum() {
    router.push({
      pathname: "/album",
      params: {
        album: `${artist} Essentials`,
        artist,
        thumbnail: artistImage,
        query: `${artist} album songs`,
      },
    });
  }

  function openRadio() {
    router.push({
      pathname: "/radio",
      params: {
        title: `${artist} Radio`,
        query: `${artist} songs`,
      },
    });
  }

  if (resolvingCatalog) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.loader}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Opening artist…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id || "track"}-${index}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => router.back()}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={loadArtistTracks}
              >
                <Ionicons name="refresh" size={21} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.hero}>
              <Image source={{ uri: artistImage }} style={styles.artistImage} />

              <Text style={styles.kicker}>ARTIST</Text>

              <Text style={styles.artistName} numberOfLines={2}>
                {artist}
              </Text>

              <Text style={styles.subtitle} numberOfLines={1}>
                Songs, albums and discovery
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[
                    styles.playButton,
                    tracks.length === 0 && styles.disabledPlayButton,
                  ]}
                  disabled={tracks.length === 0}
                  onPress={playTopSong}
                >
                  <Ionicons name="play" size={18} color="#000" />
                  <Text style={styles.playButtonText}>Play Top Song</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.secondaryButton}
                  onPress={openEssentialsAlbum}
                >
                  <Ionicons name="albums-outline" size={20} color={COLORS.text} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.secondaryButton}
                  onPress={openRadio}
                >
                  <Ionicons name="radio" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>

            {!loading && (
              <View style={styles.radioCard}>
                <View style={styles.radioIcon}>
                  <Ionicons name="radio" size={28} color={COLORS.primary} />
                </View>

                <View style={styles.radioInfo}>
                  <Text style={styles.radioTitle}>{artist} Radio</Text>
                  <Text style={styles.radioSubtitle} numberOfLines={1}>
                    Endless queue based on {artist}
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
            )}

            {loading ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading {artist}...</Text>
              </View>
            ) : (
              <>
                {albums.length > 0 && (
                  <View style={styles.albumSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Albums</Text>
                      <Text style={styles.sectionSub}>
                        Artist collections and essentials
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
                  <Text style={styles.sectionTitle}>Popular Songs</Text>
                  <Text style={styles.sectionSub} numberOfLines={1}>
                    {query}
                  </Text>
                </View>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons
                name="person-circle-outline"
                size={60}
                color={COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptyText}>
                Try refreshing this artist.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          if (loading) return null;

          return (
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.trackCard}
              onPress={() => openTrack(item)}
            >
              <Text style={styles.rank}>
                {String(index + 1).padStart(2, "0")}
              </Text>

              <Image
                source={{ uri: item.thumbnail || artistImage || FALLBACK_ARTWORK }}
                style={styles.cover}
              />

              <View style={styles.info}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {item.title || "Unknown Song"}
                </Text>

                <Text style={styles.trackArtist} numberOfLines={1}>
                  {item.artist || artist || "Unknown Artist"}
                </Text>

                <View style={styles.metaRow}>
                  <Ionicons name="tv" size={13} color="#ff3b30" />
                  <Text style={styles.metaText}>Hidden Tunes TV</Text>
                </View>
              </View>

              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color={COLORS.text} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 165,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  hero: {
    alignItems: "center",
    paddingTop: 26,
    paddingBottom: 28,
  },

  artistImage: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 22,
  },

  artistName: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 40,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },

  playButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
  },

  disabledPlayButton: {
    opacity: 0.45,
  },

  playButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 8,
  },

  secondaryButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
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

  radioInfo: {
    flex: 1,
  },

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

  loader: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 14,
  },

  albumSection: {
    marginBottom: 30,
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

  albumRow: {
    gap: 14,
    paddingRight: 20,
  },

  albumCard: {
    width: 145,
  },

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
    width: 66,
    height: 66,
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

  trackArtist: {
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
    minHeight: 260,
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
});
