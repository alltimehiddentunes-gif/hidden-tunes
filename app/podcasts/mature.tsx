import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { PodcastCategoryCard, PodcastShowCard } from "../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../components/podcast/MaturePodcastConsentModal";
import { PODCAST_ROOT_SECTIONS, type PodcastCategoryDef } from "../../constants/podcastCategories";
import { COLORS } from "../../constants/theme";
import { getPodcastShowsByCategory } from "../../services/podcastService";
import {
  disableMaturePodcasts,
  enableMaturePodcastsWithConsent,
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../utils/safeNavigation";

export default function MaturePodcastsScreen() {
  const [enabled, setEnabled] = useState(shouldIncludeMaturePodcasts());
  const [consentVisible, setConsentVisible] = useState(false);

  const shows = useMemo(() => {
    if (!shouldIncludeMaturePodcasts()) return [];
    const matureSection = PODCAST_ROOT_SECTIONS.find((section) => section.id === "mature-podcasts");
    const categoryIds = matureSection?.children?.map((child) => child.id) || [];
    return categoryIds.flatMap((id) => getPodcastShowsByCategory(id, true));
  }, [enabled]);

  useEffect(() => {
    setEnabled(shouldIncludeMaturePodcasts());
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      setEnabled(shouldIncludeMaturePodcasts());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggle = (value: boolean) => {
    if (value) {
      setConsentVisible(true);
    } else {
      void disableMaturePodcasts();
    }
  };

  const handleConfirm = () => {
    void enableMaturePodcastsWithConsent().then(() => {
      setEnabled(true);
      setConsentVisible(false);
    });
  };

  const matureSection = PODCAST_ROOT_SECTIONS.find((section) => section.id === "mature-podcasts");

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>18+</Text>
          <Text style={styles.title}>Mature Podcasts</Text>
          <Text style={styles.subtitle}>
            Explicit and adult podcast content stays locked until you confirm your age.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Enable Mature Podcasts 18+</Text>
            <Text style={styles.settingSubtitle}>
              I am 18 or older and understand this may contain explicit/adult content.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: "rgba(239,68,68,0.45)" }}
            thumbColor={enabled ? COLORS.danger : "#f4f3f4"}
          />
        </View>

        {!enabled ? (
          <View style={styles.lockedPanel}>
            <Ionicons name="lock-closed-outline" size={28} color={COLORS.danger} />
            <Text style={styles.lockedTitle}>Mature podcasts are locked</Text>
            <Text style={styles.lockedText}>
              Turn on the setting above and confirm you are 18+ to browse mature podcast categories.
            </Text>
          </View>
        ) : null}

        {enabled && matureSection?.children?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mature Categories</Text>
            <Text style={styles.hintText}>Open a show to load episodes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {matureSection.children.map((child: PodcastCategoryDef) => (
                <PodcastCategoryCard
                  key={child.id}
                  category={child}
                  onPress={() =>
                    safeRouterPush({
                      pathname: "/podcasts/category/[id]",
                      params: { id: child.id },
                    })
                  }
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {enabled ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mature Shows</Text>
            {shows.map((show) => (
              <PodcastShowCard
                key={show.id}
                show={show}
                onPress={() =>
                  safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: show.id } })
                }
              />
            ))}
            {!shows.length ? (
              <Text style={styles.empty}>No mature shows available right now.</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <MaturePodcastConsentModal
        visible={consentVisible}
        onCancel={() => setConsentVisible(false)}
        onConfirm={handleConfirm}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", padding: 18, gap: 8 },
  backButton: { padding: 4 },
  headerText: { flex: 1 },
  kicker: { color: COLORS.danger, fontSize: 10, fontWeight: "800" },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 20 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  settingCopy: { flex: 1 },
  settingTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  settingSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  lockedPanel: {
    alignItems: "center",
    padding: 24,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.18)",
    gap: 8,
  },
  lockedTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16 },
  lockedText: { color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },
  section: { gap: 10 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  hintText: { color: COLORS.textSoft, fontSize: 13 },
  empty: { color: COLORS.textMuted, textAlign: "center", paddingVertical: 16 },
});
