import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../constants/theme";

import {
  addSongToPlaylist,
  createUserPlaylist,
  getUserPlaylists,
  type UserPlaylist,
} from "../services/playlists";
import { useLocalization } from "@/localization";

type Props = {
  visible: boolean;
  track: any;
  onClose: () => void;
  onAdded?: () => void;
};

export default function AddToPlaylistModal({
  visible,
  track,
  onClose,
  onAdded,
}: Props) {
  const { t } = useLocalization();
  const musicUi = useMemo(
    () => ({
      addToPlaylist: t("music.actions.addToPlaylist"),
      newPlaylistPlaceholder: t("music.actions.newPlaylistPlaceholder"),
      noPlaylistsTitle: t("music.actions.noPlaylistsTitle"),
      noPlaylistsDescription: t("music.actions.noPlaylistsDescription"),
      formatTracks: (count: number) =>
        count === 1
          ? t("music.counts.oneTrack", { count })
          : t("music.counts.tracks", { count }),
    }),
    [t]
  );

  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (visible) {
      loadPlaylists();
    }
  }, [visible]);

  async function loadPlaylists() {
    try {
      setLoading(true);
      const data = await getUserPlaylists();
      setPlaylists(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Load playlists error:", error);
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const cleanTitle = newTitle.trim();

      if (!cleanTitle || !track) return;

      const playlist = await createUserPlaylist(cleanTitle);
      await addSongToPlaylist(playlist.id, track);

      setNewTitle("");
      await loadPlaylists();

      onAdded?.();
      onClose();
    } catch (error) {
      console.log("Create playlist error:", error);
    }
  }

  async function handleAdd(playlistId: string) {
    try {
      if (!track) return;

      await addSongToPlaylist(playlistId, track);

      onAdded?.();
      onClose();
    } catch (error) {
      console.log("Add to playlist error:", error);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{musicUi.addToPlaylist}</Text>

              <Text style={styles.subtitle} numberOfLines={1}>
                {track?.title || "Unknown Song"}
              </Text>
            </View>

            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.createRow}>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={musicUi.newPlaylistPlaceholder}
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.createButton,
                !newTitle.trim() && styles.disabledButton,
              ]}
              disabled={!newTitle.trim()}
              onPress={handleCreate}
            >
              <Ionicons name="add" size={21} color="#000" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons
                    name="albums-outline"
                    size={42}
                    color={COLORS.textMuted}
                  />

                  <Text style={styles.emptyTitle}>{musicUi.noPlaylistsTitle}</Text>

                  <Text style={styles.emptyText}>{musicUi.noPlaylistsDescription}</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.row}
                  onPress={() => handleAdd(item.id)}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name="musical-notes"
                      size={20}
                      color={COLORS.primary}
                    />
                  </View>

                  <View style={styles.info}>
                    <Text style={styles.playlistTitle} numberOfLines={1}>
                      {item.title}
                    </Text>

                    <Text style={styles.playlistMeta}>
                      {musicUi.formatTracks(item.tracks.length)}
                    </Text>
                  </View>

                  <Ionicons name="add" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: 34,
    maxHeight: "78%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontSize: 13,
    maxWidth: 250,
  },
  createRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.45,
  },
  loader: {
    paddingVertical: 34,
  },
  list: {
    marginTop: 18,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 34,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 14,
  },
  emptyText: {
    color: COLORS.textMuted,
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  playlistTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  playlistMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
});