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
  fetchHiddenTunesCatalog,
  type HiddenTunesCatalogPlaylist,
} from "../services/hiddenTunes";

export default function CloudPlaylistsScreen() {
  const [playlists, setPlaylists] = useState<HiddenTunesCatalogPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      setLoading(true);
      const data = await fetchHiddenTunesCatalog();
      setPlaylists(data.playlists);
    } catch (error) {
      console.log("Load derived playlists error:", error);
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }

  function openPlaylistSurface(item: HiddenTunesCatalogPlaylist) {
    if (item.kind === "artist" && item.routeParams?.artist) {
      router.push({ pathname: "/artist", params: item.routeParams } as any);
      return;
    }

    if (item.kind === "album" && item.routeParams?.album) {
      router.push({ pathname: "/album", params: item.routeParams } as any);
      return;
    }

    if (item.kind === "genre" && item.routeParams?.title) {
      router.push({ pathname: "/genre", params: item.routeParams } as any);
      return;
    }

    router.push("/music-feed" as any);
  }

  return (
    <LinearGradient colors={GRADIENTS.main as any} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>

        <View>
          <Text style={styles.title}>Catalog Mixes</Text>
          <Text style={styles.subtitle}>Built from current Hidden Tunes songs</Text>
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
            <Text style={styles.empty}>No catalog mixes yet.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openPlaylistSurface(item)}>
              <Image source={{ uri: item.artwork }} style={styles.cover} />

              <View style={styles.info}>
                <Text style={styles.playlistTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.meta}>
                  {item.songs.length} song{item.songs.length === 1 ? "" : "s"}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 58 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, marginBottom: 10 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 26, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, marginTop: 3, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 20, paddingBottom: 130 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 60 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: 22, padding: 14, marginBottom: 14 },
  cover: { width: 78, height: 78, borderRadius: 18, backgroundColor: COLORS.backgroundSoft },
  info: { flex: 1, marginLeft: 14 },
  playlistTitle: { color: COLORS.text, fontWeight: "900", fontSize: 16 },
  description: { color: COLORS.textMuted, marginTop: 4, fontSize: 13 },
  meta: { color: COLORS.primary, marginTop: 6, fontWeight: "800" },
});
