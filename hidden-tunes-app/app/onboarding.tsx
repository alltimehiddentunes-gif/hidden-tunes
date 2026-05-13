import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../constants/theme";

const ONBOARDING_KEY = "hidden_tunes_onboarding_seen";

export default function OnboardingScreen() {
  const finishOnboarding = async () => {
    await AsyncStorage.setItem(
      ONBOARDING_KEY,
      "true"
    );

    router.replace("/(tabs)");
  };

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.logoWrap}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.badge}>
          HIDDEN TUNES
        </Text>

        <Text style={styles.title}>
          Discover music that feels made for you.
        </Text>

        <Text style={styles.subtitle}>
          Stream songs, explore new sounds, save favorites,
          and build your own listening world.
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.button}
          onPress={finishOnboarding}
        >
          <Text style={styles.buttonText}>
            Start Listening
          </Text>

          <Ionicons
            name="arrow-forward"
            size={20}
            color="#000"
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={finishOnboarding}>
          <Text style={styles.skipText}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 70,
    paddingBottom: 44,
    justifyContent: "space-between",
  },

  logoWrap: {
    alignItems: "center",
    marginTop: 25,
  },

  logo: {
    width: 165,
    height: 165,
  },

  content: {
    marginBottom: 20,
  },

  badge: {
    alignSelf: "flex-start",
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },

  title: {
    color: COLORS.text,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "900",
    letterSpacing: -1.2,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 30,
  },

  button: {
    height: 58,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },

  buttonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "900",
  },

  skipText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 22,
  },
});