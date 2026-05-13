import { useEffect, useState } from "react";
import {
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

export default function ProfileScreen() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    online: false,
    statusText: "Checking...",
    baseUrl: "",
  });

  useEffect(() => {
    checkBackend();
  }, []);

  async function checkBackend() {
    const status = await checkYouTubeBackendStatus();
    setBackendStatus(status);
  }

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
            <Text style={styles.statusTitle}>YouTube Backend</Text>

            <Text style={styles.statusSubtitle}>
              {backendStatus.online
                ? "Streaming server connected"
                : "Streaming server offline"}
            </Text>
          </View>

          <TouchableOpacity onPress={checkBackend} style={styles.smallRefresh}>
            <Ionicons name="refresh" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>∞</Text>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Library</Text>

          <ProfileItem
            icon="albums"
            title="Playlists"
            subtitle="Create and manage your playlists"
            onPress={() => router.push("/playlists" as any)}
          />

          <ProfileItem
            icon="heart"
            title="Favorites"
            subtitle="Saved songs"
            onPress={() => router.push("/favorites" as any)}
          />

          <ProfileItem
            icon="download"
            title="Downloads"
            subtitle="Offline music"
            onPress={() => router.push("/downloads" as any)}
          />

          <ProfileItem
            icon="time"
            title="Recently Played"
            subtitle="Listening history"
            onPress={() => router.push("/recently-played" as any)}
          />

          <ProfileItem
            icon="list"
            title="Queue"
            subtitle="Up next"
            onPress={() => router.push("/queue" as any)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discovery</Text>

          <ProfileItem
            icon="radio"
            title="Personal Radio"
            subtitle="Endless smart music discovery"
            onPress={() => router.push("/radio" as any)}
          />

          <ProfileItem
            icon="sparkles"
            title="Recommended For You"
            subtitle="Smart discovery engine"
            onPress={() => {}}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>

          <ProfileItem
            icon="cloud-upload"
            title="Admin Upload"
            subtitle="Upload MP3, artwork, and synced lyrics"
            onPress={() => router.push("/admin/upload" as any)}
          />

          <ProfileItem
            icon="shield-checkmark"
            title="Privacy Policy"
            subtitle="Store-ready legal page"
            onPress={() => {}}
          />

          <ProfileItem
            icon="notifications"
            title="Notifications"
            subtitle="New music alerts"
            onPress={() => {}}
          />

          <ProfileItem
            icon="cloud"
            title="Backend Status"
            subtitle={
              backendStatus.online
                ? "Streaming server online"
                : "Streaming server offline"
            }
            onPress={checkBackend}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function ProfileItem({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: any;
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
    minHeight: 310,
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
  premiumButton: {
    marginTop: 22,
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