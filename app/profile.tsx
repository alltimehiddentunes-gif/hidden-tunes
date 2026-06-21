import { useCallback, useMemo, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";

import AppShell from "../components/navigation/AppShell";
import MatureContentConsentModal from "../components/mature/MatureContentConsentModal";
import { COLORS, GRADIENTS } from "../constants/theme";
import { usePlayerState } from "../context/PlayerContext";
import { useMatureContentSettings } from "../hooks/useMatureContentSettings";
import { getDownloadedSongs } from "../services/downloads";
import {
  getStoredUserRole,
  type UserRole,
} from "../services/onboardingPreferences";

type IconName = keyof typeof Ionicons.glyphMap;

type ProfileRoute =
  | "/auth"
  | "/search"
  | "/downloads"
  | "/playback-diagnostics"
  | "/privacy"
  | "/favorites"
  | "/playlists"
  | "/recently-played"
  | "/queue"
  | "/radio"
  | "/music-feed"
  | "/worlds"
  | "/youtube-feed";

type ProfileAction = {
  label: string;
  description: string;
  icon: IconName;
  href: "/auth" | "/downloads" | "/playback-diagnostics" | "/privacy";
};

type ProfileShortcut = {
  title: string;
  subtitle: string;
  icon: IconName;
  href: ProfileRoute;
};

const PROFILE_ACTIONS: ProfileAction[] = [
  {
    label: "Account",
    description: "Sign in or create an account (optional)",
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

const LIBRARY_SHORTCUTS: ProfileShortcut[] = [
  {
    title: "Search",
    subtitle: "Find songs, artists, moods, and lyrics",
    icon: "search-outline",
    href: "/search",
  },
  {
    title: "Favorites",
    subtitle: "Songs you have saved",
    icon: "heart-outline",
    href: "/favorites",
  },
  {
    title: "Playlists",
    subtitle: "Your library and smart playlists",
    icon: "albums-outline",
    href: "/playlists",
  },
  {
    title: "Downloads",
    subtitle: "Offline listening",
    icon: "download-outline",
    href: "/downloads",
  },
  {
    title: "Recently Played",
    subtitle: "Listening history",
    icon: "time-outline",
    href: "/recently-played",
  },
  {
    title: "Queue",
    subtitle: "Up next",
    icon: "list-outline",
    href: "/queue",
  },
];

const DISCOVERY_SHORTCUTS: ProfileShortcut[] = [
  {
    title: "Home",
    subtitle: "Browse the music catalog",
    icon: "home-outline",
    href: "/music-feed",
  },
  {
    title: "Worlds",
    subtitle: "Explore mood worlds",
    icon: "sparkles-outline",
    href: "/worlds",
  },
  {
    title: "Personal Radio",
    subtitle: "Smart endless discovery",
    icon: "radio-outline",
    href: "/radio",
  },
  {
    title: "Hidden Tunes TV",
    subtitle: "Video and TV feed",
    icon: "tv-outline",
    href: "/youtube-feed",
  },
];

const ROLE_COPY: Record<
  UserRole,
  { label: string; eyebrow: string; description: string }
> = {
  listener: {
    label: "Listener",
    eyebrow: "Personal listening",
    description:
      "Library, downloads, favorites, and discovery — no account required.",
  },
  artist: {
    label: "Artist",
    eyebrow: "Creator studio",
    description:
      "Local listening profile with creator-oriented discovery shortcuts.",
  },
  uploader: {
    label: "Uploader",
    eyebrow: "Catalog workspace",
    description: "Manage listening and catalog flows from your device library.",
  },
  admin: {
    label: "Admin",
    eyebrow: "Operations",
    description: "Quick access to library, diagnostics, and discovery tools.",
  },
  owner: {
    label: "Owner",
    eyebrow: "Owner console",
    description: "High-level library and playback shortcuts on this device.",
  },
};

function ProfileRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.84} style={styles.item} onPress={onPress}>
      <LinearGradient colors={GRADIENTS.card} style={styles.itemIcon}>
        <Ionicons name={icon} size={21} color={COLORS.primary} />
      </LinearGradient>

      <View style={styles.itemTextWrap}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { favorites, recentlyPlayed, activeQueue, songs, onlineSongs } =
    usePlayerState();
  const { enabled, enableWithConsent, disable } = useMatureContentSettings();
  const [enableMatureModalVisible, setEnableMatureModalVisible] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("listener");
  const [downloadsCount, setDownloadsCount] = useState<number | null>(null);

  const roleCopy = ROLE_COPY[userRole];

  const catalogTrackCount = useMemo(() => {
    const ids = new Set<string>();

    [...songs, ...onlineSongs].forEach((song) => {
      if (song?.id != null) {
        ids.add(String(song.id));
      }
    });

    return ids.size;
  }, [onlineSongs, songs]);

  const statCards = useMemo(() => {
    const cards: { value: string; label: string }[] = [];

    if (downloadsCount !== null) {
      cards.push({
        value: String(downloadsCount),
        label: downloadsCount === 1 ? "Download" : "Downloads",
      });
    }

    cards.push({
      value: String(favorites.length),
      label: favorites.length === 1 ? "Favorite" : "Favorites",
    });

    cards.push({
      value: String(recentlyPlayed.length),
      label: "Recent",
    });

    if (activeQueue.length > 0) {
      cards.push({
        value: String(activeQueue.length),
        label: activeQueue.length === 1 ? "In queue" : "In queue",
      });
    }

    if (catalogTrackCount > 0) {
      cards.push({
        value: String(catalogTrackCount),
        label: catalogTrackCount === 1 ? "Catalog" : "Catalog",
      });
    }

    return cards;
  }, [
    activeQueue.length,
    catalogTrackCount,
    downloadsCount,
    favorites.length,
    recentlyPlayed.length,
  ]);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null;

  const refreshProfileData = useCallback(async () => {
    try {
      const [role, downloads] = await Promise.all([
        getStoredUserRole(),
        getDownloadedSongs(),
      ]);
      setUserRole(role);
      setDownloadsCount(downloads.length);
    } catch {
      setDownloadsCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshProfileData();
    }, [refreshProfileData])
  );

  const openRoute = useCallback((href: ProfileRoute) => {
    router.push(href as never);
  }, []);

  const handleMatureToggle = useCallback(
    (nextValue: boolean) => {
      if (nextValue) {
        setEnableMatureModalVisible(true);
        return;
      }

      void disable();
    },
    [disable]
  );

  const cancelEnableMature = useCallback(() => {
    setEnableMatureModalVisible(false);
  }, []);

  const confirmEnableMature = useCallback(() => {
    void enableWithConsent().then(() => {
      setEnableMatureModalVisible(false);
    });
  }, [enableWithConsent]);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View pointerEvents="none" style={styles.glowPurple} />
        <View pointerEvents="none" style={styles.glowCyan} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.topBar}>
            <Text style={styles.kicker}>PROFILE</Text>
          </View>

          <LinearGradient colors={GRADIENTS.card} style={styles.heroCard}>
            <View pointerEvents="none" style={styles.heroGlow} />

            <Image
              source={require("../assets/images/logo.png")}
              style={styles.logo}
            />

            <Text style={styles.heroName}>Hidden Tunes</Text>

            <Text style={styles.heroSubtitle}>
              Premium music discovery powered by live streaming
            </Text>

            <View style={styles.rolePill}>
              <Ionicons name="person-circle" size={17} color="#000" />
              <Text style={styles.rolePillText}>{roleCopy.label} profile</Text>
            </View>

            <Text style={styles.guestNote}>
              Guest listening · sign in optional
            </Text>
          </LinearGradient>

          {statCards.length > 0 ? (
            <View style={styles.statsRow}>
              {statCards.map((stat, index) => (
                <View key={stat.label} style={[styles.statCard, index === 0 && styles.statCardFeatured]}>
                  <Text style={styles.statNumber}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.dashboardHero}>
            <Text style={styles.dashboardEyebrow}>{roleCopy.eyebrow}</Text>
            <Text style={styles.dashboardTitle}>{roleCopy.label} space</Text>
            <Text style={styles.dashboardDescription}>{roleCopy.description}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Content preferences</Text>

            <View style={styles.settingRow}>
              <LinearGradient colors={GRADIENTS.card} style={styles.itemIcon}>
                <Ionicons name="eye-off-outline" size={21} color={COLORS.primary} />
              </LinearGradient>

              <View style={styles.itemTextWrap}>
                <Text style={styles.itemTitle}>Show 18+ Content</Text>
                <Text style={styles.itemSubtitle}>
                  Include mature radio, podcast shows, and episodes
                </Text>
              </View>

              <Switch
                value={enabled}
                onValueChange={handleMatureToggle}
                trackColor={{
                  false: "rgba(255,255,255,0.12)",
                  true: "rgba(168,85,247,0.45)",
                }}
                thumbColor={enabled ? COLORS.primary : "#f4f3f4"}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account & tools</Text>

            {PROFILE_ACTIONS.map((action) => (
              <ProfileRow
                key={action.href}
                icon={action.icon}
                title={action.label}
                subtitle={action.description}
                onPress={() => openRoute(action.href)}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your library</Text>

            {LIBRARY_SHORTCUTS.map((shortcut) => (
              <ProfileRow
                key={shortcut.href + shortcut.title}
                icon={shortcut.icon}
                title={shortcut.title}
                subtitle={shortcut.subtitle}
                onPress={() => openRoute(shortcut.href)}
              />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Discovery</Text>

            {DISCOVERY_SHORTCUTS.map((shortcut) => (
              <ProfileRow
                key={shortcut.href}
                icon={shortcut.icon}
                title={shortcut.title}
                subtitle={shortcut.subtitle}
                onPress={() => openRoute(shortcut.href)}
              />
            ))}
          </View>

          {appVersion ? (
            <View style={styles.versionRow}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.textMuted} />
              <Text style={styles.versionText}>Hidden Tunes v{appVersion}</Text>
            </View>
          ) : null}
        </ScrollView>

        <MatureContentConsentModal
          visible={enableMatureModalVisible}
          onCancel={cancelEnableMature}
          onConfirm={confirmEnableMature}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 152,
  },
  glowPurple: {
    position: "absolute",
    top: 40,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.15)",
  },
  glowCyan: {
    position: "absolute",
    top: 280,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  kicker: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  heroCard: {
    marginTop: 8,
    borderRadius: 32,
    padding: 26,
    minHeight: 292,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    overflow: "hidden",
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 9,
  },
  heroGlow: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(34,211,238,0.16)",
    top: -70,
    right: -70,
  },
  logo: {
    width: 104,
    height: 104,
    borderRadius: 30,
    marginBottom: 15,
  },
  heroName: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  rolePill: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
  },
  rolePillText: {
    color: "#000",
    fontWeight: "900",
    marginLeft: 7,
    fontSize: 12,
  },
  guestNote: {
    marginTop: 12,
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: "900",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    minWidth: "30%",
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 22,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statCardFeatured: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.28)",
  },

  statNumber: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 6,
    fontWeight: "700",
    textAlign: "center",
  },
  dashboardHero: {
    marginTop: 22,
    borderRadius: 28,
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  dashboardEyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  dashboardTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 8,
  },
  dashboardDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    marginBottom: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  itemIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  itemSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    marginBottom: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  versionRow: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 8,
  },
  versionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
});
