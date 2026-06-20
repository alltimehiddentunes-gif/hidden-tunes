import { useCallback, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { RadioCategoryCard } from "../../components/radio/RadioBrowserCards";
import { COLORS } from "../../constants/theme";
import { prefetchRadioStationsForCategory } from "../../services/radioStationApi";
import { LAUNCH_RADIO_CATEGORIES } from "../../utils/launchRadioCategories";

export default function RadioBrowserHomeScreen() {
  const openCategory = useCallback((categoryId: string) => {
    prefetchRadioStationsForCategory(categoryId);
    router.push({
      pathname: "/stations/[categoryId]",
      params: { categoryId },
    } as any);
  }, []);

  const categories = useMemo(() => LAUNCH_RADIO_CATEGORIES, []);

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
          <Text style={styles.title}>Live Stations</Text>
          <Text style={styles.subtitle}>
            Browse live rooms curated for Hidden Tunes
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {categories.map((category) => (
            <RadioCategoryCard
              key={category.id}
              category={category}
              onPress={() => openCategory(category.id)}
            />
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.listeningRoomLink}
          onPress={() =>
            router.push({
              pathname: "/radio",
              params: { title: "Hidden Tunes Listening Room" },
            } as any)
          }
        >
          <Ionicons name="musical-notes-outline" size={18} color={COLORS.primary} />
          <Text style={styles.listeningRoomText}>
            Open song listening rooms
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
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
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
  },
  listeningRoomLink: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  listeningRoomText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
