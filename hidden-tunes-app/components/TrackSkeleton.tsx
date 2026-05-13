import { StyleSheet, View } from "react-native";

export default function TrackSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cover} />

      <View style={styles.textBox}>
        <View style={styles.title} />
        <View style={styles.artist} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 76,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  cover: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  textBox: {
    flex: 1,
    marginLeft: 14,
  },

  title: {
    width: "72%",
    height: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginBottom: 12,
  },

  artist: {
    width: "46%",
    height: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});