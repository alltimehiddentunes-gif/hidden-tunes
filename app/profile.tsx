import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import AppShell from "../components/navigation/AppShell";
import { COLORS, GRADIENTS } from "../constants/theme";

type ProfileAction = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: "/auth" | "/downloads" | "/playback-diagnostics" | "/privacy";
};

const PROFILE_ACTIONS: ProfileAction[] = [
  {
    label: "Account",
    description: "Sign in or create an account",
    icon: "person-add-outline",
    href: "/auth",
  },
  {
    label: "Downloads",
    description: "View saved offline music",
    icon: "download-outline",
    href: "/downloads",
  },
  {
    label: "Diagnostics",
    description: "Open playback diagnostic logs",
    icon: "pulse-outline",
    href: "/playback-diagnostics",
  },
  {
    label: "Privacy",
    description: "Read the Hidden Tunes privacy policy",
    icon: "shield-checkmark-outline",
    href: "/privacy",
  },
];

export default function ProfileScreen() {
  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Ionicons name="person-circle" size={56} color={COLORS.primaryGlow} />
            </View>

            <View style={styles.heroText}>
              <Text style={styles.eyebrow}>Hidden Tunes</Text>
              <Text style={styles.title}>Profile</Text>
              <Text style={styles.subtitle}>
                Account, offline music, diagnostics, and privacy tools.
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            {PROFILE_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.href}
                activeOpacity={0.86}
                style={styles.actionRow}
                onPress={() => router.push(action.href as any)}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon} size={22} color={COLORS.primaryGlow} />
                </View>

                <View style={styles.actionText}>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Text style={styles.actionDescription}>{action.description}</Text>
                </View>

                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 140,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 26,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.34)",
  },
  heroText: {
    flex: 1,
  },
  eyebrow: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 3,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  actions: {
    gap: 12,
  },
  actionRow: {
    minHeight: 76,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.13)",
  },
  actionText: {
    flex: 1,
  },
  actionLabel: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  actionDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
});
