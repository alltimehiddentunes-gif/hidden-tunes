import { useMemo } from "react";
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

import { COLORS, GRADIENTS } from "../constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type UploaderSection = {
  title: string;
  description: string;
  statusLabel: string;
  icon: IconName;
  accent: string;
};

const UPLOADER_SECTIONS: UploaderSection[] = [
  {
    title: "Assigned Releases",
    description: "Future releases assigned to this uploader will be grouped here.",
    statusLabel: "0 assigned",
    icon: "albums",
    accent: COLORS.primary,
  },
  {
    title: "Catalog Management",
    description: "Review song metadata, release details, and catalog readiness.",
    statusLabel: "Preview",
    icon: "library",
    accent: "#22d3ee",
  },
  {
    title: "Lyrics Management",
    description: "Prepare plain lyrics and synced lyrics for assigned tracks.",
    statusLabel: "Ready later",
    icon: "document-text",
    accent: "#a855f7",
  },
  {
    title: "Review Queue",
    description: "Support review workflows before admin or owner approval.",
    statusLabel: "0 queued",
    icon: "clipboard",
    accent: "#f59e0b",
  },
  {
    title: "Artwork / Metadata Fixes",
    description: "Track artwork swaps, title corrections, and metadata cleanup.",
    statusLabel: "0 fixes",
    icon: "image",
    accent: "#ef4444",
  },
];

export default function UploaderDashboardScreen() {
  const summary = useMemo(
    () => ({
      sections: UPLOADER_SECTIONS.length,
      assigned: 0,
      authority: "Admin final",
    }),
    []
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={styles.kicker}>UPLOADER WORKSPACE</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.glow} />

          <View style={styles.heroIcon}>
            <Ionicons name="cloud-upload" size={34} color={COLORS.primary} />
          </View>

          <Text style={styles.heroTitle}>Uploader Dashboard</Text>
          <Text style={styles.heroSubtitle}>
            A safe mobile foundation for assigned catalog work, metadata fixes,
            artwork and lyrics support, and review workflow visibility.
          </Text>

          <View style={styles.heroPills}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.sections}</Text>
              <Text style={styles.heroPillLabel}>Sections</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.assigned}</Text>
              <Text style={styles.heroPillLabel}>Live items</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.authority}</Text>
              <Text style={styles.heroPillLabel}>Authority</Text>
            </View>
          </View>
        </View>

        <View style={styles.copyCard}>
          <Text style={styles.copyTitle}>Catalog support, not final authority</Text>
          <Text style={styles.copyText}>
            Uploaders will be able to manage assigned catalog items, fix metadata,
            update artwork and lyrics, and support review workflows. Admin and owner
            accounts remain the final authority for approvals and publishing.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Catalog Work Areas</Text>
          <Text style={styles.sectionSubtitle}>Local UI preview only</Text>
        </View>

        <View style={styles.sectionList}>
          {UPLOADER_SECTIONS.map((section) => (
            <UploaderSectionCard key={section.title} section={section} />
          ))}
        </View>

        <View style={styles.safetyCard}>
          <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
          <View style={styles.safetyTextWrap}>
            <Text style={styles.safetyTitle}>Safe foundation phase</Text>
            <Text style={styles.safetyText}>
              This screen does not edit catalog data, upload files, change artwork,
              or call admin APIs. It only prepares the uploader workspace layout.
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function UploaderSectionCard({ section }: { section: UploaderSection }) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.sectionCard}
      onPress={() => undefined}
    >
      <View
        style={[
          styles.sectionIcon,
          {
            backgroundColor: `${section.accent}24`,
            borderColor: `${section.accent}55`,
          },
        ]}
      >
        <Ionicons name={section.icon} size={22} color={section.accent} />
      </View>

      <View style={styles.sectionTextWrap}>
        <Text style={styles.sectionCardTitle}>{section.title}</Text>
        <Text style={styles.sectionDescription}>{section.description}</Text>
      </View>

      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>{section.statusLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  heroCard: {
    marginTop: 24,
    borderRadius: 34,
    padding: 24,
    minHeight: 330,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(34,211,238,0.18)",
    top: -90,
    right: -90,
  },
  heroIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.26)",
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 36,
    fontWeight: "900",
    marginTop: 22,
    letterSpacing: -1.1,
  },
  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  heroPills: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  heroPill: {
    flex: 1,
    borderRadius: 20,
    padding: 13,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  heroPillNumber: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  heroPillLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  copyCard: {
    marginTop: 18,
    borderRadius: 28,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  copyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  copyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionList: {
    gap: 12,
  },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 26,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sectionIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginRight: 14,
  },
  sectionTextWrap: {
    flex: 1,
  },
  sectionCardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  sectionDescription: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  statusBadge: {
    marginLeft: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  safetyCard: {
    marginTop: 20,
    flexDirection: "row",
    borderRadius: 26,
    padding: 18,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.18)",
  },
  safetyTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  safetyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  safetyText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});
