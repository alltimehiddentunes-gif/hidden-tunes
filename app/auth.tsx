import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.logoBox}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brand}>Hidden Tunes</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>
            {mode === "login" ? "Welcome back" : "Create account"}
          </Text>

          <Text style={styles.subtitle}>
            {mode === "login"
              ? "Sign in to continue your listening world."
              : "Join Hidden Tunes and save your music journey."}
          </Text>

          <View style={styles.inputBox}>
            <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              placeholder="Email address"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputBox}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              placeholder="Password"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              secureTextEntry
            />
          </View>

          {mode === "signup" && (
            <View style={styles.inputBox}>
              <Ionicons name="person-outline" size={20} color={COLORS.textMuted} />
              <TextInput
                placeholder="Display name"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
              />
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.mainButton}
            onPress={() => router.replace("/music-feed")}
          >
            <Text style={styles.mainButtonText}>
              {mode === "login" ? "Sign In" : "Create Account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setMode(mode === "login" ? "signup" : "login")}
          >
            <Text style={styles.switchText}>
              {mode === "login"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 58,
    paddingBottom: 30,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 30,
  },
  logo: {
    width: 98,
    height: 98,
  },
  brand: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 10,
  },
  card: {
    borderRadius: 34,
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  title: {
    color: COLORS.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 24,
  },
  inputBox: {
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 10,
  },
  mainButton: {
    height: 56,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  mainButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "900",
  },
  switchButton: {
    marginTop: 18,
    alignItems: "center",
  },
  switchText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
  },
});