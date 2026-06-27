import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { PodcastCategoryCard, PodcastShowCard } from "../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../components/podcast/MaturePodcastConsentModal";
import PodcastScreenHeader from "../../components/podcast/PodcastScreenHeader";
import PodcastSearchBar from "../../components/podcast/PodcastSearchBar";
import PodcastSearchResults from "../../components/podcast/PodcastSearchResults";
import { COLORS } from "../../constants/theme";
import { getMaturePodcastPageSections } from "../../services/podcastService";
import {
  disableMaturePodcasts,
  enableMaturePodcastsWithConsent,
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../utils/safeNavigation";
import { usePodcastLocalSearch } from "../../hooks/usePodcastLocalSearch";

export default function MaturePodcastsScreen() {
  const [enabled, setEnabled] = useState(shouldIncludeMaturePodcasts());
  const [consentVisible, setConsentVisible] = useState(false);
  const { query, setQuery, results, hasQuery } = usePodcastLocalSearch({ matureOnly: true });

  const pageData = useMemo(
    () => getMaturePodcastPageSections(shouldIncludeMaturePodcasts()),
    [enabled]
  );

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

  const openShow = useCallback((showId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: showId } });
  }, []);

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastScreenHeader
        kicker="18+"
        title="Mature Podcasts"
        subtitle="Explicit and adult podcast content stays locked until you confirm your age."
      >
        {enabled ? <PodcastSearchBar value={query} onChangeText={setQuery} /> : null}
      </PodcastScreenHeader>

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

        {enabled ? (
          <>
            <PodcastSearchResults results={results} hasQuery={hasQuery} onOpenShow={openShow} />

            {!hasQuery ? (
              <>
                {pageData.categories.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Mature Categories</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {pageData.categories.map((child) => (
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

                {pageData.sections.map((section) => (
                  <View key={section.id} style={styles.section}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    {section.shows.map((show) => (
                      <PodcastShowCard
                        key={`${section.id}-${show.id}`}
                        show={show}
                        onPress={() => openShow(show.id)}
                      />
                    ))}
                  </View>
                ))}
              </>
            ) : null}
          </>
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
});
