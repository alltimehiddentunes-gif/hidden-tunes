import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../constants/theme";
import {
  getHiddenTunesCloudPlaylists,
  type HiddenTunesCloudPlaylist,
} from "../services/hiddenTunesApi";

export default function CloudPlaylistsScreen() {
  const [playlists, setPlaylists] = useState<HiddenTunesCloudPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      setLoading(true);
      const data = await getHiddenTunesCloudPlaylists();
      setPlaylists(data);
    } catch (error) {
      console.log("Load cloud playlists error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View>
          <Text style={styles.title}>Playlists</Text>
          <Text style={styles.subtitle}>Curated for your listening</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No playlists yet.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/playlist/[id]",
                  params: { id: item.id },
                } as any)
              }
            >
              {item.artwork ? (
                <Image source={{ uri: item.artwork }} style={styles.cover} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons
                    name="musical-notes"
                    size={34}
                    color={COLORS.textMuted}
                  />
                </View>
              )}

              <View style={styles.info}>
                <Text style={styles.playlistTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                <Text style={styles.description} numberOfLines={2}>
                  {item.description || "Hidden Tunes cloud playlist"}
                </Text>

                <Text style={styles.meta}>
                  {item.tracks.length} track{item.tracks.length === 1 ? "" : "s"}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={22}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          )}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 58 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: COLORS.text, fontSize: 26, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, marginTop: 3, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 20, paddingBottom: 130 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 60 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
  },
  cover: {
    width: 78,
    height: 78,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundSoft,
  },
  coverPlaceholder: {
    width: 78,
    height: 78,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, marginLeft: 14 },
  playlistTitle: { color: COLORS.text, fontWeight: "900", fontSize: 16 },
  description: { color: COLORS.textMuted, marginTop: 4, fontSize: 13 },
  meta: { color: COLORS.primary, marginTop: 6, fontWeight: "800" },
});
