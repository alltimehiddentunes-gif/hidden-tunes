import { useCallback, useEffect, useState } from "react";
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

import { PodcastCategoryCard } from "../../../components/podcast/PodcastDiscoveryCards";
import MatureContentConsentModal from "../../../components/mature/MatureContentConsentModal";
import { getMaturePodcastSubcategories } from "../../../constants/podcastCategories";
import { COLORS } from "../../../constants/theme";
import { useMatureContentGate } from "../../../hooks/useMatureContentGate";
import { useMatureContentSettings } from "../../../hooks/useMatureContentSettings";

export default function PodcastMatureHubScreen() {
  const { includeMatureInApi } = useMatureContentSettings();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();

  const [subcategories, setSubcategories] = useState(() =>
    includeMatureInApi ? getMaturePodcastSubcategories() : []
  );

  useEffect(() => {
    setSubcategories(includeMatureInApi ? getMaturePodcastSubcategories() : []);
  }, [includeMatureInApi]);

  const openSubcategory = useCallback((categoryId: string) => {
    router.push({
      pathname: "/podcasts/[categoryId]",
      params: { categoryId },
    } as any);
  }, []);

  if (!includeMatureInApi) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>MATURE 18+</Text>
            <Text style={styles.title}>Adult Podcasts</Text>
          </View>
        </View>
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.gateTitle}>Mature podcasts are off</Text>
          <Text style={styles.gateText}>
            Enable mature content in Profile settings to browse adult podcast rooms.
          </Text>
          <TouchableOpacity style={styles.profileLink} onPress={() => router.push("/profile" as any)}>
            <Text style={styles.profileLinkText}>Open Profile settings</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>MATURE 18+</Text>
          <Text style={styles.title}>Adult Podcast Rooms</Text>
          <Text style={styles.subtitle}>
            Dating · Relationships · Marriage · Psychology · After Dark · More
          </Text>
        </View>
      </View>

      {subcategories.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {subcategories.map((category) => (
              <PodcastCategoryCard
                key={category.id}
                category={category}
                onPress={() =>
                  runWithMatureConsent(
                    { is_mature: true, content_rating: "adult" },
                    () => openSubcategory(category.id)
                  )
                }
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.gateTitle}>Adult podcast rooms are unavailable right now</Text>
          <Text style={styles.gateText}>Try again later or browse standard podcast categories.</Text>
        </View>
      )}

      <MatureContentConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
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
    fontSize: 26,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  gateTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  gateText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  profileLink: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  profileLinkText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
