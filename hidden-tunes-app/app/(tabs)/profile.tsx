import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  BackendStatus,
  checkYouTubeBackendStatus,
} from "../../services/youtubeBackend";
import {
  getStoredUserRole,
  type UserRole,
} from "../../services/onboardingPreferences";

type IconName = keyof typeof Ionicons.glyphMap;

type DashboardAction = {
  icon: IconName;
  title: string;
  subtitle: string;
  accent: string;
  onPress: () => void;
};

const ADMIN_BASE_URL = "https://admin.hiddentunes.com";

const ROLE_COPY: Record<
  UserRole,
  {
    label: string;
    eyebrow: string;
    description: string;
  }
> = {
  listener: {
    label: "Listener",
    eyebrow: "Personal listening",
    description:
      "Your music space stays focused on library, downloads, favorites, and preferences.",
  },
  artist: {
    label: "Artist",
    eyebrow: "Creator studio",
    description:
      "Prepare submissions, lyrics, artwork, and release review tracking from one place.",
  },
  uploader: {
    label: "Uploader",
    eyebrow: "Catalog workspace",
    description:
      "Manage assigned releases, lyrics, and catalog work while permissions stay server-controlled.",
  },
  admin: {
    label: "Admin",
    eyebrow: "Operations dashboard",
    description:
      "Quick links into releases, uploaders, legacy uploads, and moderation operations.",
  },
  owner: {
    label: "Owner",
    eyebrow: "Owner console",
    description:
      "High-level access points for catalog operations, ownership cleanup, and team management.",
  },
};

export default function ProfileScreen() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    online: false,
    statusText: "",
    baseUrl: "",
  });
  const [userRole, setUserRole] = useState<UserRole>("listener");

  useEffect(() => {
    checkBackend();
    loadStoredRole();
  }, []);

  async function loadStoredRole() {
    try {
      const role = await getStoredUserRole();
      setUserRole(role);
    } catch {
      setUserRole("listener");
    }
  }

  async function checkBackend() {
    const status = await checkYouTubeBackendStatus();
    setBackendStatus(status);
  }

  function openPlaceholder(title: string) {
    Alert.alert(title, "This dashboard area is prepared for a later phase.");
  }

  function openAdminPath(path: string) {
    Linking.openURL(`${ADMIN_BASE_URL}${path}`).catch(() => {
      Alert.alert("Admin link unavailable", "Open the admin dashboard directly.");
    });
  }

  const dashboardActions = useMemo(
    () => getDashboardActions(userRole, openPlaceholder, openAdminPath),
    [userRole]
  );
  const roleCopy = ROLE_COPY[userRole];

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <Text style={styles.kicker}>PROFILE</Text>

          <TouchableOpacity style={styles.iconButton} onPress={checkBackend}>
            <Ionicons name="refresh" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.glow} />

          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
          />

          <Text style={styles.name}>Hidden Tunes</Text>

          <Text style={styles.subtitle}>
            Premium music discovery powered by live streaming
          </Text>

          <View style={styles.rolePill}>
            <Ionicons name="person-circle" size={17} color="#000" />
            <Text style={styles.rolePillText}>{roleCopy.label} Mode</Text>
          </View>

          <TouchableOpacity style={styles.premiumButton}>
            <Ionicons name="sparkles" size={17} color="#000" />
            <Text style={styles.premiumText}>Hidden Premium</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: backendStatus.online ? "#22c55e" : "#ef4444",
              },
            ]}
          />

          <View style={styles.statusTextWrap}>
            <Text style={styles.statusTitle}>Hidden Tunes TV</Text>

            <Text style={styles.statusSubtitle}>
              {backendStatus.online ? "Ready to play" : "Tap refresh to retry"}
            </Text>
          </View>

          <TouchableOpacity onPress={checkBackend} style={styles.smallRefresh}>
            <Ionicons name="refresh" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>All</Text>
            <Text style={styles.statLabel}>Songs</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>HD</Text>
            <Text style={styles.statLabel}>Audio</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>24/7</Text>
            <Text style={styles.statLabel}>Discovery</Text>
          </View>
        </View>

        <View style={styles.dashboardHero}>
          <Text style={styles.dashboardEyebrow}>{roleCopy.eyebrow}</Text>
          <Text style={styles.dashboardTitle}>{roleCopy.label} Dashboard</Text>
          <Text style={styles.dashboardDescription}>{roleCopy.description}</Text>
        </View>

        <View style={styles.dashboardGrid}>
          {dashboardActions.map((action) => (
            <DashboardCard key={action.title} action={action} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Library</Text>

          <ProfileItem
            icon="albums"
            title="Playlists"
            subtitle="Create and manage your playlists"
            onPress={() => router.push("/playlists" as never)}
          />

          <ProfileItem
            icon="heart"
            title="Favorites"
            subtitle="Saved songs"
            onPress={() => router.push("/favorites" as never)}
          />

          <ProfileItem
            icon="download"
            title="Downloads"
            subtitle="Offline music"
            onPress={() => router.push("/downloads" as never)}
          />

          <ProfileItem
            icon="time"
            title="Recently Played"
            subtitle="Listening history"
            onPress={() => router.push("/recently-played" as never)}
          />

          <ProfileItem
            icon="list"
            title="Queue"
            subtitle="Up next"
            onPress={() => router.push("/queue" as never)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discovery</Text>

          <ProfileItem
            icon="radio"
            title="Personal Radio"
            subtitle="Endless smart music discovery"
            onPress={() => router.push("/radio" as never)}
          />

          <ProfileItem
            icon="sparkles"
            title="Recommended For You"
            subtitle="Smart discovery engine"
            onPress={() => openPlaceholder("Recommended For You")}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>

          <ProfileItem
            icon="cloud-upload"
            title="Upload"
            subtitle="Add music to Hidden Tunes"
            onPress={() => openPlaceholder("Upload")}
          />

          <ProfileItem
            icon="shield-checkmark"
            title="Privacy Policy"
            subtitle="How Hidden Tunes protects you"
            onPress={() => openPlaceholder("Privacy Policy")}
          />

          <ProfileItem
            icon="notifications"
            title="Notifications"
            subtitle="New music alerts"
            onPress={() => openPlaceholder("Notifications")}
          />

          <ProfileItem
            icon="cloud"
            title="TV Status"
            subtitle={backendStatus.online ? "Ready" : "Try again"}
            onPress={checkBackend}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function getDashboardActions(
  role: UserRole,
  openPlaceholder: (title: string) => void,
  openAdminPath: (path: string) => void
): DashboardAction[] {
  if (role === "artist") {
    return [
      {
        icon: "folder-open",
        title: "My Submissions",
        subtitle: "Track releases prepared for review.",
        accent: "#a855f7",
        onPress: () => router.push("/artist-submissions" as never),
      },
      {
        icon: "cloud-upload",
        title: "Upload Music",
        subtitle: "Prepare a new artist submission.",
        accent: COLORS.primary,
        onPress: () => openAdminPath("/admin/upload"),
      },
      {
        icon: "image",
        title: "Lyrics & Artwork",
        subtitle: "Manage presentation assets.",
        accent: "#22d3ee",
        onPress: () => openPlaceholder("Lyrics & Artwork"),
      },
      {
        icon: "hourglass",
        title: "Pending Review",
        subtitle: "See releases awaiting approval.",
        accent: "#f59e0b",
        onPress: () => openPlaceholder("Pending Review"),
      },
      {
        icon: "checkmark-done",
        title: "Approved Releases",
        subtitle: "View accepted catalog items.",
        accent: "#22c55e",
        onPress: () => openPlaceholder("Approved Releases"),
      },
    ];
  }

  if (role === "uploader") {
    return [
      {
        icon: "albums",
        title: "Assigned Releases",
        subtitle: "Open releases assigned to you.",
        accent: COLORS.primary,
        onPress: () => openAdminPath("/admin/releases"),
      },
      {
        icon: "library",
        title: "Catalog Management",
        subtitle: "Review release metadata and assets.",
        accent: "#22d3ee",
        onPress: () => openAdminPath("/admin/releases"),
      },
      {
        icon: "document-text",
        title: "Lyrics Management",
        subtitle: "Prepare lyrics and synced text.",
        accent: "#a855f7",
        onPress: () => openAdminPath("/admin/releases"),
      },
      {
        icon: "clipboard",
        title: "Review Queue",
        subtitle: "Track items requiring action.",
        accent: "#f59e0b",
        onPress: () => openPlaceholder("Review Queue"),
      },
    ];
  }

  if (role === "admin" || role === "owner") {
    return [
      {
        icon: "speedometer",
        title: "Admin Dashboard",
        subtitle: "Open the secure operations console.",
        accent: COLORS.primary,
        onPress: () => openAdminPath("/admin/releases"),
      },
      {
        icon: "people",
        title: "Uploaders",
        subtitle: "Manage uploader access and roles.",
        accent: "#22d3ee",
        onPress: () => openAdminPath("/admin/uploaders"),
      },
      {
        icon: "albums",
        title: "Releases",
        subtitle: "Search and manage catalog releases.",
        accent: "#a855f7",
        onPress: () => openAdminPath("/admin/releases"),
      },
      {
        icon: "archive",
        title: "Legacy Uploads",
        subtitle: "Backfill ownership for old releases.",
        accent: "#f59e0b",
        onPress: () => openAdminPath("/admin/uploads/legacy"),
      },
      {
        icon: "shield-checkmark",
        title: "Moderation Queue",
        subtitle: "Review flagged catalog activity.",
        accent: "#ef4444",
        onPress: () => openPlaceholder("Moderation Queue"),
      },
    ];
  }

  return [
    {
      icon: "cloud-upload",
      title: "Local Uploads",
      subtitle: "Prepare personal music tools.",
      accent: COLORS.primary,
      onPress: () => openPlaceholder("Local Uploads"),
    },
    {
      icon: "heart",
      title: "Favorites",
      subtitle: "Jump back into saved songs.",
      accent: "#ff0066",
      onPress: () => router.push("/favorites" as never),
    },
    {
      icon: "download",
      title: "Downloads",
      subtitle: "Open offline listening.",
      accent: "#22d3ee",
      onPress: () => router.push("/downloads" as never),
    },
    {
      icon: "options",
      title: "Listening Preferences",
      subtitle: "Tune mood, energy, and discovery.",
      accent: "#a855f7",
      onPress: () => openPlaceholder("Listening Preferences"),
    },
  ];
}

function DashboardCard({ action }: { action: DashboardAction }) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.dashboardCard}
      onPress={action.onPress}
    >
      <View
        style={[
          styles.dashboardIcon,
          {
            backgroundColor: `${action.accent}24`,
            borderColor: `${action.accent}55`,
          },
        ]}
      >
        <Ionicons name={action.icon} size={22} color={action.accent} />
      </View>

      <Text style={styles.dashboardCardTitle}>{action.title}</Text>
      <Text style={styles.dashboardCardSubtitle}>{action.subtitle}</Text>
    </TouchableOpacity>
  );
}

function ProfileItem({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.84} style={styles.item} onPress={onPress}>
      <View style={styles.itemIcon}>
        <Ionicons name={icon} size={21} color={COLORS.primary} />
      </View>

      <View style={styles.itemTextWrap}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 68,
    paddingHorizontal: 20,
    paddingBottom: 165,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroCard: {
    marginTop: 24,
    borderRadius: 34,
    padding: 26,
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: "rgba(34,197,94,0.18)",
    top: -70,
    right: -70,
  },
  logo: {
    width: 112,
    height: 112,
    borderRadius: 32,
    marginBottom: 18,
  },
  name: {
    color: COLORS.text,
    fontSize: 31,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 21,
  },
  rolePill: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
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
  premiumButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
  },
  premiumText: {
    color: "#000",
    fontWeight: "900",
    marginLeft: 8,
  },
  statusCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    marginRight: 12,
  },
  statusTextWrap: {
    flex: 1,
  },
  statusTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  statusSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
  smallRefresh: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  statCard: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
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
  },
  dashboardHero: {
    marginTop: 24,
    borderRadius: 30,
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
    fontSize: 26,
    fontWeight: "900",
    marginTop: 8,
  },
  dashboardDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
  dashboardGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dashboardCard: {
    width: "48%",
    minHeight: 158,
    borderRadius: 26,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  dashboardIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dashboardCardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 14,
  },
  dashboardCardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  section: {
    marginTop: 30,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginBottom: 14,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  itemIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(34,197,94,0.12)",
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
    marginTop: 4,
  },
});
