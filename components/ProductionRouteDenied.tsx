import { StyleSheet, Text, View } from "react-native";

export const isProductionBuild =
  process.env.EXPO_PUBLIC_BUILD_PROFILE === "production";

export function ProductionRouteDenied() {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>Not available</Text>
      <Text style={styles.body}>This internal tool is disabled in production.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#050505",
  },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  body: { color: "#A1A1AA", fontSize: 15, marginTop: 8, textAlign: "center" },
});
