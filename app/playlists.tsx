import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useFocusEffect, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../constants/theme";

import {
  generateSmartPlaylists,
  getUserPlaylists,
  renameUserPlaylist,
  type SmartPlaylist,
  type UserPlaylist,
} from "../services/playlists";

import { getHiddenTunesSongs } from "../services/hiddenTunesApi";

type LibraryPlaylist = UserPlaylist | SmartPlaylist;

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

function isSmartPlaylist(playlist: LibraryPlaylist): playlist is SmartPlaylist {
  return Boolean((playlist as SmartPlaylist).isSmart);
}

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylist[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const [renameVisible, setRenameVisible] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<UserPlaylist | null>(
    null
  );
  const [renameText, setRenameText] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
    }, [])
  );

  async function loadPlaylists() {
    try {
      const [userData, cloudSongs] = await Promise.all([
        getUserPlaylists(),
        getHiddenTunesSongs(),
      ]);

      const safeUserPlaylists = Array.isArray(userData) ? userData : [];
      const safeCloudSongs = Array.isArray(cloudSongs) ? cloudSongs : [];

      setPlaylists(safeUserPlaylists);
      setSmartPlaylists(generateSmartPlaylists(safeCloudSongs, safeUserPlaylists));
    } catch (error) {
      console.log("Load playlists screen error:", error);
      setPlaylists([]);
      setSmartPlaylists([]);
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true);
      await loadPlaylists();
    } finally {
      setRefreshing(false);
    }
  }

  function openRenameModal(playlist: UserPlaylist) {
    setSelectedPlaylist(playlist);
    setRenameText(playlist.title);
    setRenameVisible(true);
  }

  function closeRenameModal() {
    setRenameVisible(false);
    setSelectedPlaylist(null);
    setRenameText("");
  }

  async function handleRename() {
    try {
      if (!selectedPlaylist) return;

      const cleanTitle = renameText.trim();
      if (!cleanTitle) return;

      await renameUserPlaylist(selectedPlaylist.id, cleanTitle);
      await loadPlaylists();
      closeRenameModal();
    } catch (error) {
      console.log("Rename playlist error:", error);
    }
  }

  const filteredPlaylists = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) return playlists;

    return playlists.filter((playlist) => {
      const titleMatch = playlist.title.toLowerCase().includes(cleanQuery);
      const descriptionMatch =
        playlist.description?.toLowerCase().includes(cleanQuery) || false;

      const trackMatch = playlist.tracks.some((track) => {
        return (
          track.title.toLowerCase().includes(cleanQuery) ||
          track.artist.toLowerCase().includes(cleanQuery) ||
          track.album?.toLowerCase().includes(cleanQuery)
        );
      });

      return titleMatch || descriptionMatch || trackMatch;
    });
  }, [playlists, query]);

  const filteredSmartPlaylists = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) return smartPlaylists;

    return smartPlaylists.filter((playlist) => {
      const titleMatch = playlist.title.toLowerCase().includes(cleanQuery);
      const descriptionMatch =
        playlist.description?.toLowerCase().includes(cleanQuery) || false;

      const trackMatch = playlist.tracks.some((track) => {
        return (
          track.title.toLowerCase().includes(cleanQuery) ||
          track.artist.toLowerCase().includes(cleanQuery) ||
          track.album?.toLowerCase().includes(cleanQuery) ||
          track.genre?.toLowerCase().includes(cleanQuery) ||
          track.mood?.toLowerCase().includes(cleanQuery)
        );
      });

      return titleMatch || descriptionMatch || trackMatch;
    });
  }, [smartPlaylists, query]);

  const totalSongs = useMemo(() => {
    return playlists.reduce((sum, playlist) => {
      return sum + playlist.tracks.length;
    }, 0);
  }, [playlists]);

  const totalFound = filteredPlaylists.length + filteredSmartPlaylists.length;

  function openPlaylist(playlist: LibraryPlaylist) {
    router.push({
      pathname: "/playlist/[id]",
      params: { id: playlist.id },
    } as any);
  }

  function renderPlaylistCard(item: LibraryPlaylist, smart = false) {
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.86}
        style={styles.card}
        onPress={() => openPlaylist(item)}
      >
        {item.artwork ? (
          <Image source={{ uri: item.artwork }} style={styles.cover} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons
              name={smart ? "sparkles" : "musical-notes"}
              size={34}
              color={COLORS.textMuted}
            />
          </View>
        )}

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.playlistName} numberOfLines={1}>
              {item.title}
            </Text>

            {smart && (
              <View style={styles.smartBadge}>
                <Ionicons name="sparkles" size={10} color="#000" />
                <Text style={styles.smartBadgeText}>SMART</Text>
              </View>
            )}
          </View>

          <Text style={styles.meta} numberOfLines={2}>
            {item.tracks.length} track{item.tracks.length === 1 ? "" : "s"} ·{" "}
            {smart
              ? item.description || "Made for you"
              : `Updated ${formatDate(item.updatedAt)}`}
          </Text>
        </View>

        {!smart && (
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.moreButton}
            onPress={() => openRenameModal(item as UserPlaylist)}
          >
            <Ionicons
              name="create-outline"
              size={20}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>
        )}

        <Ionicons
          name="chevron-forward"
          size={20}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.container}>
      <FlatList
        data={filteredPlaylists}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>

              <View>
                <Text style={styles.kicker}>YOUR LIBRARY</Text>
                <Text style={styles.title}>Playlists</Text>
              </View>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroTitle}>
                  {playlists.length} Playlist
                  {playlists.length === 1 ? "" : "s"}
                </Text>

                <Text style={styles.heroSubtitle}>
                  {totalSongs} saved track{totalSongs === 1 ? "" : "s"} ·{" "}
                  {smartPlaylists.length} smart mix
                  {smartPlaylists.length === 1 ? "" : "es"}
                </Text>
              </View>

              <View style={styles.heroIcon}>
                <Ionicons
                  name="musical-notes"
                  size={36}
                  color={COLORS.primary}
                />
              </View>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={19} color={COLORS.textMuted} />

              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search playlists, songs, artists..."
                placeholderTextColor={COLORS.textMuted}
                style={styles.searchInput}
              />

              {query.trim().length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>

            {filteredSmartPlaylists.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Smart Mixes</Text>
                    <Text style={styles.sectionSubtitle}>
                      Made from your listening
                    </Text>
                  </View>

                  <Text style={styles.sectionMeta}>
                    {filteredSmartPlaylists.length} found
                  </Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.smartRow}
                >
                  {filteredSmartPlaylists.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.86}
                      style={styles.smartCard}
                      onPress={() => openPlaylist(item)}
                    >
                      {item.artwork ? (
                        <Image
                          source={{ uri: item.artwork }}
                          style={styles.smartCover}
                        />
                      ) : (
                        <View style={styles.smartPlaceholder}>
                          <Ionicons
                            name="sparkles"
                            size={32}
                            color={COLORS.textMuted}
                          />
                        </View>
                      )}

                      <View style={styles.smartMiniBadge}>
                        <Ionicons name="sparkles" size={10} color="#000" />
                        <Text style={styles.smartMiniBadgeText}>SMART</Text>
                      </View>

                      <Text style={styles.smartTitle} numberOfLines={2}>
                        {item.title}
                      </Text>

                      <Text style={styles.smartMeta} numberOfLines={1}>
                        {item.tracks.length} tracks
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  {query.trim() ? "Search results" : "Your playlists"}
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Saved playlists you created
                </Text>
              </View>

              <Text style={styles.sectionMeta}>{totalFound} found</Text>
            </View>

            {query.trim() && filteredPlaylists.length === 0 && (
              <View style={styles.noUserResults}>
                <Text style={styles.noUserResultsText}>
                  No saved playlists match this search.
                </Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !query.trim() && filteredSmartPlaylists.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="albums-outline"
                size={64}
                color={COLORS.textMuted}
              />

              <Text style={styles.emptyTitle}>No playlists yet</Text>

              <Text style={styles.emptyText}>
                Add songs using the playlist + button.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => renderPlaylistCard(item, false)}
      />

      <Modal visible={renameVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeRenameModal}>
          <Pressable style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Rename Playlist</Text>

                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {selectedPlaylist?.title || "Playlist"}
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
              onPress={handleRename}
            >
              <Text style={styles.renameButtonText}>Save Name</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  content: {
    paddingTop: 62,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
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

  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },

  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 5,
  },

  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 30,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 18,
  },

  heroLeft: { flex: 1 },

  heroTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  heroSubtitle: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },

  heroIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  searchBox: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 22,
  },

  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },

  sectionHeader: {
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: COLORS.textMuted,
    marginTop: 5,
    fontSize: 12,
    fontWeight: "700",
  },

  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },

  smartRow: {
    gap: 14,
    paddingRight: 20,
    paddingBottom: 28,
  },

  smartCard: {
    width: 150,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  smartCover: {
    width: "100%",
    height: 126,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    marginBottom: 10,
  },

  smartPlaceholder: {
    width: "100%",
    height: 126,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  smartMiniBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },

  smartMiniBadgeText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "900",
  },

  smartTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },

  smartMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
  },

  noUserResults: {
    paddingVertical: 18,
    alignItems: "center",
  },

  noUserResultsText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 24,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  cover: {
    width: 74,
    height: 74,
    borderRadius: 18,
    backgroundColor: COLORS.card,
  },

  placeholder: {
    width: 74,
    height: 74,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },

  info: {
    flex: 1,
    marginLeft: 14,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  playlistName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
  },

  smartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },

  smartBadgeText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "900",
  },

  meta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },

  moreButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },

  empty: {
    alignItems: "center",
    paddingTop: 80,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 20,
  },

  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
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
