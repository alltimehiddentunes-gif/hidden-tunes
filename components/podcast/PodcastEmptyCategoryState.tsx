import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../../constants/theme";

type PodcastEmptyCategoryStateProps = {
  onBrowseAll: () => void;
};

export default function PodcastEmptyCategoryState({ onBrowseAll }: PodcastEmptyCategoryStateProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>This podcast room is not ready yet.</Text>
      <Text style={styles.copy}>More shows are being added.</Text>
      <TouchableOpacity style={styles.button} onPress={onBrowseAll} activeOpacity={0.88}>
        <Text style={styles.buttonText}>Browse all podcasts</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  copy: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.2)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: "700",
  },
});
