import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

type LyricsEmptyStateProps = {
  title?: string;
  message?: string;
  variant?: "missing" | "error";
};

export default function LyricsEmptyState({
  title = "No lyrics yet",
  message = "When lyrics are added for this track, they will appear here in sync with playback.",
  variant = "missing",
}: LyricsEmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.orbWrap}>
        <LinearGradient
          colors={["rgba(168,85,247,0.35)", "rgba(247,215,122,0.22)", "rgba(5,5,8,0)"]}
          style={styles.orb}
        />
        <View style={styles.iconBadge}>
          <Ionicons
            name={variant === "error" ? "alert-circle-outline" : "musical-notes-outline"}
            size={30}
            color="#F7D77A"
          />
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    zIndex: 3,
  },

  orbWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  orb: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    borderRadius: 60,
    opacity: 0.9,
  },

  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(247,215,122,0.24)",
  },

  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "center",
    letterSpacing: -0.3,
  },

  message: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
});
