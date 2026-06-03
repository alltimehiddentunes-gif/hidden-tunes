import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../../context/PlayerContext";

import MediaCard from "../../components/MediaCard";
import PlaylistArtworkCollage from "../../components/PlaylistArtworkCollage";
import NeonEQ from "../../components/NeonEQ";

import { getHiddenTunesSongs } from "../../services/hiddenTunesApi";

import {
  clearUserPlaylist,
  deleteUserPlaylist,
  generateSmartPlaylists,
  getUserPlaylistById,
  getUserPlaylists,
  removeSongFromPlaylist,
  renameUserPlaylist,
  type SmartPlaylist,
  type UserPlaylist,
} from "../../services/playlists";

type PlaylistDetail = UserPlaylist | SmartPlaylist;

function formatDate(value?: string) {
  if (!value) return "Recently updated";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently updated";

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Recently updated";
  }
}

function isSmartPlaylist(playlist: PlaylistDetail | null): playlist is SmartPlaylist {
  return Boolean((playlist as SmartPlaylist | null)?.isSmart);
}

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams();
  const playlistId = String(id);

  const { playSong, playQueue } = usePlayerActions();
  const { currentSong, isPlaying } = usePlayerNowPlaying();

  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");

  const smart = isSmartPlaylist(playlist);
  const tracks = useMemo(() => playlist?.tracks || [], [playlist]);

  async function loadPlaylist() {
    try {
      const userPlaylist = await getUserPlaylistById(playlistId);

      if (userPlaylist) {
        setPlaylist(userPlaylist);
        return;
      }

      const [cloudSongs, userPlaylists] = await Promise.all([
        getHiddenTunesSongs(),
        getUserPlaylists(),
      ]);

      const smartPlaylists = generateSmartPlaylists(
        Array.isArray(cloudSongs) ? cloudSongs : [],
        Array.isArray(userPlaylists) ? userPlaylists : []
      );

      const smartPlaylist =
        smartPlaylists.find((item) => item.id === playlistId) || null;

      setPlaylist(smartPlaylist);
    } catch (error) {
      console.log("Load playlist detail error:", error);
      setPlaylist(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadPlaylist();
    }, [playlistId])
  );

  function getTrackId(track: any) {
    return String(
      track?.id || track?.videoId || `${track?.title}-${track?.artist}`
    )
      .replace("youtube-", "")
      .trim();
  }

  function getTrackImage(track: any) {
    return track?.cover || track?.thumbnail || track?.artwork || null;
  }

  function getTrackArtist(track: any) {
    return (
      track?.artist ||
      track?.user?.name ||
      track?.channelTitle ||
      track?.sourceName ||
      "Hidden Tunes"
    );
  }

  function normalizeTrack(track: any) {
    const artist = getTrackArtist(track);
    const image = getTrackImage(track);
    const streamUrl = track?.streamUrl || track?.url || track?.audioUrl;

    return {
      ...track,
      id: getTrackId(track),
      title: track?.title || "Unknown Song",
      artist,
      user: track?.user || {
        name: artist,
      },
      channelTitle: track?.channelTitle || artist,
      cover: image,
      thumbnail: track?.thumbnail || image,
      artwork: track?.artwork || image,
      url: track?.url || streamUrl,
      streamUrl,
      sourceName: track?.sourceName || track?.source || "Hidden Tunes",
      type: track?.type || "r2",
      isOnline: track?.isOnline ?? true,
    };
  }

  const normalizedTracks = useMemo(() => {
    return tracks.map(normalizeTrack);
  }, [tracks]);

  function playTrack(track: any) {
    if (!track || !normalizedTracks.length) return;

    const trackId = getTrackId(track);
    const startIndex = Math.max(
      0,
      normalizedTracks.findIndex((item: any) => item.id === trackId)
    );

    const normalized = normalizeTrack(track);
    void playSong(normalized, normalizedTracks, startIndex, {
      source: "playlist",
      label: playlist?.title || "Playlist",
      railId: playlistId,
      artistName: normalized.artist,
      genre: normalized.genre,
      mood: normalized.mood,
    }).catch((error: unknown) => {
      if (__DEV__) console.log("Playlist play error:", error);
    });
  }

  function handlePlayAll() {
    if (!normalizedTracks.length) return;

    if (playQueue) {
      void playQueue(normalizedTracks, 0, false, {
        source: "playlist",
        label: playlist?.title || "Playlist",
        railId: playlistId,
        artistName: normalizedTracks[0]?.artist,
        genre: normalizedTracks[0]?.genre,
        mood: normalizedTracks[0]?.mood,
      }).catch((error: unknown) => {
        if (__DEV__) console.log("Playlist play-all error:", error);
      });
      return;
    }

    playTrack(normalizedTracks[0]);
  }

  async function handleRemoveTrack(trackId: string) {
    if (smart) return;

    try {
      await removeSongFromPlaylist(playlistId, trackId);
      await loadPlaylist();
    } catch (error) {
      console.log("Remove playlist track error:", error);
    }
  }

  function openRenameModal() {
    if (!playlist || smart) return;

    setRenameText(playlist.title);
    setRenameVisible(true);
  }

  function closeRenameModal() {
    setRenameVisible(false);
    setRenameText("");
  }

  async function handleRenamePlaylist() {
    try {
      const cleanTitle = renameText.trim();

      if (!cleanTitle || !playlist || smart) return;

      await renameUserPlaylist(playlist.id, cleanTitle);
      await loadPlaylist();
      closeRenameModal();
    } catch (error) {
      console.log("Rename playlist error:", error);
    }
  }

  function handleClearPlaylist() {
    if (!playlist || smart) return;

    Alert.alert(
      "Clear Playlist",
      `Remove all songs from "${playlist.title}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearUserPlaylist(playlist.id);
              await loadPlaylist();
            } catch (error) {
              console.log("Clear playlist error:", error);
            }
          },
        },
      ]
    );
  }

  function handleDeletePlaylist() {
    if (smart) return;

    Alert.alert(
      "Delete Playlist",
      `Delete "${playlist?.title || "Playlist"}"? This cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserPlaylist(playlistId);
              router.back();
            } catch (error) {
              console.log("Delete playlist error:", error);
            }
          },
        },
      ]
    );
  }

  if (!playlist) {
    return (
      <LinearGradient colors={GRADIENTS.main as any} style={styles.container}>
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.missingBox}>
          <Ionicons
            name="alert-circle-outline"
            size={50}
            color={COLORS.textMuted}
          />

          <Text style={styles.missing}>Playlist not found.</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {!smart && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={openRenameModal} style={styles.topButton}>
              <Ionicons name="create-outline" size={21} color={COLORS.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleClearPlaylist} style={styles.topButton}>
              <Ionicons
                name="remove-circle-outline"
                size={22}
                color={COLORS.text}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDeletePlaylist} style={styles.topButton}>
              <Ionicons name="trash-outline" size={21} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={normalizedTracks}
        keyExtractor={(item, index) => `${getTrackId(item)}_${index}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={styles.coverShadow}>
              <PlaylistArtworkCollage tracks={normalizedTracks} size={188} />
            </View>

            {smart && (
              <View style={styles.smartBadge}>
                <Ionicons name="sparkles" size={12} color="#000" />
                <Text style={styles.smartBadgeText}>SMART MIX</Text>
              </View>
            )}

            <Text numberOfLines={2} style={styles.title}>
              {playlist.title}
            </Text>

            <Text style={styles.subtitle}>
              {normalizedTracks.length}{" "}
              {normalizedTracks.length === 1 ? "song" : "songs"}
              {smart ? " · Auto-generated" : ` · Updated ${formatDate(playlist.updatedAt)}`}
            </Text>

            {smart && Boolean(playlist.description) && (
              <Text style={styles.descriptionText}>{playlist.description}</Text>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handlePlayAll}
                disabled={!normalizedTracks.length}
                style={[
                  styles.playBtn,
                  !normalizedTracks.length && styles.playBtnDisabled,
                ]}
              >
                <Ionicons name="play" size={20} color="#000" />
                <Text style={styles.playText}>Play Playlist</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/queue" as any)}
                disabled={!normalizedTracks.length}
                style={[
                  styles.queueBtn,
                  !normalizedTracks.length && styles.playBtnDisabled,
                ]}
              >
                <Ionicons name="list" size={21} color={COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/music-feed" as any)}
                style={styles.addBtn}
              >
                <Ionicons name="add" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {!smart ? (
              <View style={styles.managementRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.managePill}
                  onPress={openRenameModal}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={COLORS.primary}
                  />
                  <Text style={styles.managePillText}>Rename</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.managePill,
                    !normalizedTracks.length && styles.managePillDisabled,
                  ]}
                  disabled={!normalizedTracks.length}
                  onPress={handleClearPlaylist}
                >
                  <Ionicons
                    name="remove-circle-outline"
                    size={14}
                    color={COLORS.primary}
                  />
                  <Text style={styles.managePillText}>Clear songs</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.managementRow}>
                <View style={styles.managePill}>
                  <Ionicons name="flash" size={14} color={COLORS.primary} />
                  <Text style={styles.managePillText}>Made for you</Text>
                </View>
              </View>
            )}

            <View style={styles.helperPill}>
              <Ionicons name="sync" size={13} color={COLORS.primary} />

              <Text style={styles.helperText}>
                {smart
                ? "Smart mixes update as you listen"
                  : "Playlist queue saves automatically"}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons
              name="musical-notes-outline"
              size={50}
              color={COLORS.textMuted}
            />

            <Text style={styles.emptyTitle}>No songs yet</Text>

            <Text style={styles.emptyText}>
              {smart
                ? "This smart mix needs more matching songs."
                : "Add songs from Search, Explore, Radio, or Player using the plus button."}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const trackId = getTrackId(item);
          const active = currentSong?.id === trackId;

          return (
            <View style={[styles.trackShell, active && styles.trackShellActive]}>
              <MediaCard
                title={item.title || "Unknown Song"}
                subtitle={`${getTrackArtist(item)} • ${
                  item.sourceName || "Hidden Tunes"
                }`}
                image={getTrackImage(item)}
                type="song"
                size="medium"
                showPlayButton={false}
                onPress={() => playTrack(item)}
              />

              <View style={styles.trackActions}>
                {active ? (
                  <View style={styles.eqBox}>
                    <NeonEQ isPlaying={isPlaying} size="small" />
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.playIconButton}
                    onPress={() => playTrack(item)}
                  >
                    <Ionicons name="play" size={18} color="#000" />
                  </TouchableOpacity>
                )}

                {!smart && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.removeButton}
                    onPress={() => handleRemoveTrack(trackId)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {!smart && (
        <Modal visible={renameVisible} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={closeRenameModal}>
            <Pressable style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Rename Playlist</Text>

                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {playlist.title}
                  </Text>
                </View>

                <TouchableOpacity onPress={closeRenameModal}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Playlist name"
                placeholderTextColor={COLORS.textMuted}
                style={styles.renameInput}
                autoFocus
              />

              <TouchableOpacity
                activeOpacity={0.86}
                style={[
                  styles.renameButton,
                  !renameText.trim() && styles.renameButtonDisabled,
                ]}
                disabled={!renameText.trim()}
                onPress={handleRenamePlaylist}
              >
                <Text style={styles.renameButtonText}>Save Name</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
  },

  glowPurple: {
    position: "absolute",
    top: 20,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.18)",
  },

  glowCyan: {
    position: "absolute",
    top: 300,
    right: -140,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.11)",
  },

  topHeader: {
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 2,
  },

  headerActions: {
    flexDirection: "row",
    gap: 8,
  },

  topButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 26,
  },

  coverShadow: {
    width: 188,
    height: 188,
    borderRadius: 46,
    marginBottom: 22,
    shadowColor: "#A855F7",
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 8,
  },

  smartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },

  smartBadgeText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.7,
  },

  subtitle: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontWeight: "800",
    textAlign: "center",
  },

  descriptionText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
  },

  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 22,
  },

  playBtnDisabled: {
    opacity: 0.45,
  },

  playText: {
    color: "#000",
    fontWeight: "900",
  },

  queueBtn: {
    width: 50,
    height: 50,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  addBtn: {
    width: 50,
    height: 50,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  managementRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  managePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.075)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  managePillDisabled: {
    opacity: 0.45,
  },

  managePillText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },

  helperPill: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.075)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },

  helperText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },

  list: {
    paddingHorizontal: 18,
    paddingBottom: 160,
  },

  trackShell: {
    position: "relative",
    marginBottom: 2,
  },

  trackShellActive: {
    borderRadius: 26,
    backgroundColor: "rgba(168,85,247,0.12)",
  },

  trackActions: {
    position: "absolute",
    right: 14,
    top: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  playIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
  },

  eqBox: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBox: {
    alignItems: "center",
    paddingTop: 35,
    paddingHorizontal: 28,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 14,
  },

  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  missingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  missing: {
    color: COLORS.text,
    textAlign: "center",
    marginTop: 14,
    fontSize: 16,
    fontWeight: "800",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },

  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modalTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  modalSubtitle: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontSize: 13,
    maxWidth: 250,
  },

  renameInput: {
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginTop: 22,
  },

  renameButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },

  renameButtonDisabled: {
    opacity: 0.45,
  },

  renameButtonText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 15,
  },
});
