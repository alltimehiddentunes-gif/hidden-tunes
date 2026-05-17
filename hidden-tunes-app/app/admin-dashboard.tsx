import { useMemo } from "react";
import {
  Alert,
  Linking,
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

type AdminSection = {
  title: string;
  description: string;
  statusLabel: string;
  icon: IconName;
  accent: string;
  path?: string;
};

const ADMIN_BASE_URL = "https://admin.hiddentunes.com";

const ADMIN_SECTIONS: AdminSection[] = [
  {
    title: "Releases",
    description: "Open the secure catalog dashboard for releases and assets.",
    statusLabel: "Web portal",
    icon: "albums",
    accent: COLORS.primary,
    path: "/admin/releases",
  },
  {
    title: "Uploaders",
    description: "Manage uploader profiles, roles, and active access.",
    statusLabel: "Owner tools",
    icon: "people",
    accent: "#22d3ee",
    path: "/admin/uploaders",
  },
  {
    title: "Legacy Uploads",
    description: "Backfill uploader ownership for older catalog rows.",
    statusLabel: "Ownership",
    icon: "archive",
    accent: "#f59e0b",
    path: "/admin/uploads/legacy",
  },
  {
    title: "Moderation Queue",
    description: "Prepare review surfaces for flagged content and workflow triage.",
    statusLabel: "Preview",
    icon: "shield-checkmark",
    accent: "#ef4444",
  },
  {
    title: "Rights & Review",
    description: "Track future copyright, duplicate, and license review states.",
    statusLabel: "Review",
    icon: "document-text",
    accent: "#a855f7",
    path: "/admin/releases",
  },
  {
    title: "Platform Controls",
    description: "Quick access to upload operations and platform maintenance.",
    statusLabel: "Admin",
    icon: "speedometer",
    accent: "#22c55e",
    path: "/admin/upload",
  },
];

export default function AdminDashboardScreen() {
  const summary = useMemo(
    () => ({
      sections: ADMIN_SECTIONS.length,
      authority: "Final",
      permissions: "Server enforced",
    }),
    []
  );

  function openAdminPath(path?: string) {
    if (!path) {
      Alert.alert(
        "Coming later",
        "This mobile entry point is prepared for a later admin workflow."
      );
      return;
    }

    Linking.openURL(`${ADMIN_BASE_URL}${path}`).catch(() => {
      Alert.alert("Admin link unavailable", "Open the admin dashboard directly.");
    });
  }

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

          <Text style={styles.kicker}>ADMIN / OWNER</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.glow} />

          <View style={styles.heroIcon}>
            <Ionicons name="shield" size={34} color={COLORS.primary} />
          </View>

          <Text style={styles.heroTitle}>Platform Control</Text>
          <Text style={styles.heroSubtitle}>
            A mobile entry point for admin and owner operations. Real permissions,
            approvals, and publishing controls remain enforced by the secure backend
            and admin portal.
          </Text>

          <View style={styles.heroPills}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.sections}</Text>
              <Text style={styles.heroPillLabel}>Sections</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.authority}</Text>
              <Text style={styles.heroPillLabel}>Authority</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.permissions}</Text>
              <Text style={styles.heroPillLabel}>Permissions</Text>
            </View>
          </View>
        </View>

        <View style={styles.copyCard}>
          <Text style={styles.copyTitle}>Final authority stays protected</Text>
          <Text style={styles.copyText}>
            Admin and owner accounts control releases, uploaders, legacy ownership,
            moderation, and rights review from the secure web portal. This mobile
            dashboard is an elegant entry point, not a native editing system.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Control Areas</Text>
          <Text style={styles.sectionSubtitle}>Secure web portal links</Text>
        </View>

        <View style={styles.sectionList}>
          {ADMIN_SECTIONS.map((section) => (
            <AdminSectionCard
              key={section.title}
              section={section}
              onPress={() => openAdminPath(section.path)}
            />
          ))}
        </View>

        <View style={styles.safetyCard}>
          <Ionicons name="lock-closed" size={22} color={COLORS.primary} />
          <View style={styles.safetyTextWrap}>
            <Text style={styles.safetyTitle}>Secure foundation phase</Text>
            <Text style={styles.safetyText}>
              This screen does not edit releases, manage users, publish music, or
              call admin APIs directly. The admin portal remains the source of
              truth for permissions and operations.
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function AdminSectionCard({
  section,
  onPress,
}: {
  section: AdminSection;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.sectionCard} onPress={onPress}>
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
    minHeight: 340,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: "rgba(250,204,21,0.16)",
    top: -95,
    right: -95,
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
    fontSize: 15,
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
