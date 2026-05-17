import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Redirect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS, GRADIENTS } from "../constants/theme";
import { hasCompletedOnboarding } from "../services/onboardingPreferences";

export default function IndexScreen() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await hasCompletedOnboarding();
        setTarget(completed ? "/(tabs)" : "/onboarding");
      } catch {
        setTarget("/onboarding");
      }
    };

    checkOnboarding();
  }, []);

  if (target) {
    return <Redirect href={target as any} />;
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.logoCircle}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logoImage}
        />
      </View>

      <Text style={styles.logo}>Hidden Tunes</Text>

      <Text style={styles.subtitle}>Preparing your sound</Text>

      <ActivityIndicator
        size="large"
        color={COLORS.primary}
        style={styles.loader}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  logoCircle: {
    width: 118,
    height: 118,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },

  logoImage: {
    width: 88,
    height: 88,
    borderRadius: 24,
  },

  logo: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    marginTop: 26,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginTop: 10,
    fontWeight: "700",
  },

  loader: {
    marginTop: 34,
  },
});
