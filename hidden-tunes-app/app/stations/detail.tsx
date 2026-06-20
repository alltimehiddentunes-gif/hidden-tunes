import { useCallback, useMemo } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import HTImage from "../../components/HTImage";
import { COLORS } from "../../constants/theme";
import { sanitizeStationTagsForDisplay } from "../../services/radioStationApi";
import { getCachedRadioStation } from "../../utils/radioStationCache";
import { getLaunchRadioCategory } from "../../utils/launchRadioCategories";

export default function RadioStationDetailScreen() {
  const params = useLocalSearchParams<{
    categoryId?: string;
    stationId?: string;
    name?: string;
  }>();

  const categoryId = String(params.categoryId || "").trim();
  const stationId = String(params.stationId || "").trim();
  const category = useMemo(
    () => getLaunchRadioCategory(categoryId),
    [categoryId]
  );

  const station = useMemo(
    () => getCachedRadioStation(categoryId, stationId),
    [categoryId, stationId]
  );

  const displayName = station?.name || String(params.name || "Hidden Tunes Station");

  const openListeningRoom = useCallback(() => {
    if (!category) return;

    router.push({
      pathname: "/radio",
      params: {
        title: category.title,
        query: category.listeningRoomQuery,
        genre: category.tag || "",
      },
    } as any);
  }, [category]);

  const handleTuneIn = useCallback(() => {
    Alert.alert(
      "Hidden Tunes Radio",
      "In-app live station playback is coming soon. Song listening rooms are ready now with Hidden Tunes catalog tracks.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Open listening room",
          onPress: openListeningRoom,
        },
      ]
    );
  }, [openListeningRoom]);

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES RADIO</Text>
          <Text style={styles.title} numberOfLines={2}>
            {displayName}
          </Text>
          <Text style={styles.subtitle}>
            {category?.title || "Hidden Tunes station"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {station?.favicon ? (
            <HTImage uri={station.favicon} style={styles.heroArt} />
          ) : (
            <View style={styles.heroArtFallback}>
              <Ionicons name="radio" size={42} color={COLORS.primary} />
            </View>
          )}
        </View>

        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Hidden Tunes station</Text>
          {station?.country ? (
            <Text style={styles.metaLine}>Region · {station.country}</Text>
          ) : null}
          {station?.language ? (
            <Text style={styles.metaLine}>Language · {station.language}</Text>
          ) : null}
          {sanitizeStationTagsForDisplay(station?.tags || []).length ? (
            <Text style={styles.metaLine}>
              Vibe ·{" "}
              {sanitizeStationTagsForDisplay(station?.tags || [])
                .slice(0, 4)
                .join(", ")}
            </Text>
          ) : null}
          {station?.bitrate ? (
            <Text style={styles.metaLine}>Quality · {station.bitrate} kbps</Text>
          ) : null}
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.primaryButton}
          onPress={handleTuneIn}
        >
          <Ionicons name="radio-outline" size={18} color="#000" />
          <Text style={styles.primaryButtonText}>Tune in</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.secondaryButton}
          onPress={openListeningRoom}
        >
          <Ionicons name="musical-notes-outline" size={18} color={COLORS.text} />
          <Text style={styles.secondaryButtonText}>
            Open Hidden Tunes listening room
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Live streams stay separate from on-demand song playback so your queue,
          MiniPlayer, and auto-next stay stable.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  hero: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 18,
  },
  heroArt: {
    width: 132,
    height: 132,
    borderRadius: 28,
  },
  heroArtFallback: {
    width: 132,
    height: 132,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  metaCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 18,
    gap: 6,
  },
  metaLabel: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metaLine: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
    backgroundColor: COLORS.primary,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  note: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 16,
    textAlign: "center",
  },
});
