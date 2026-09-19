import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import {
  getCurrentSupabaseSessionSummary,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from "../services/mobileSupabaseAuth";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void getCurrentSupabaseSessionSummary().then((session) => {
      if (active && session.isSignedIn) router.replace("/(tabs)");
    });

    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setMessage("");

    if (mode === "reset") {
      setBusy(true);
      const result = await requestPasswordReset(email);
      setBusy(false);
      setMessageTone(result.error ? "error" : "success");
      setMessage(result.error || "If an account exists for that email, a reset link is on its way.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setBusy(true);
    if (mode === "login") {
      const result = await signInWithPassword(email, password);
      setBusy(false);
      if (result.error) {
        setMessageTone("error");
        setMessage(result.error);
        return;
      }
      router.replace("/(tabs)");
      return;
    }

    const result = await signUpWithPassword(email, password, displayName);
    setBusy(false);

    if (result.error) {
      setMessageTone("error");
      setMessage(result.error);
      return;
    }

    if (mode === "signup" && result.needsEmailConfirmation) {
      setMessageTone("success");
      setMessage("Account created. Check your email to confirm it, then sign in.");
      setMode("login");
      setPassword("");
      setConfirmPassword("");
      return;
    }

    router.replace("/(tabs)");
  }

  const isReset = mode === "reset";

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
            {isReset ? "Reset password" : mode === "login" ? "Welcome back" : "Create account"}
          </Text>

          <Text style={styles.subtitle}>
            {isReset
              ? "Enter your email and we will send a secure reset link."
              : mode === "login"
              ? "Sign in to continue your listening world."
              : "Join Hidden Tunes and save your music journey."}
          </Text>

          <View style={styles.inputBox}>
            <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
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
              value={password}
              onChangeText={setPassword}
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
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display name"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
              />
            </View>
          )}

          {mode === "signup" && (
            <View style={styles.inputBox}>
              <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.textMuted} />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                secureTextEntry
              />
            </View>
          )}

          {message ? (
            <Text style={[styles.message, messageTone === "success" ? styles.successMessage : null]}>
              {message}
            </Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.mainButton, busy && styles.mainButtonDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.mainButtonText}>
              {isReset ? "Send Reset Link" : mode === "login" ? "Sign In" : "Create Account"}
            </Text>}
          </TouchableOpacity>

          {mode === "login" ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setMessage(""); setMode("reset"); }}>
              <Text style={styles.secondaryText}>Forgot password?</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => { setMessage(""); setMode(isReset || mode === "signup" ? "login" : "signup"); }}
          >
            <Text style={styles.switchText}>
              {isReset
                ? "Back to sign in"
                : mode === "login"
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
  mainButtonDisabled: {
    opacity: 0.72,
  },
  message: {
    color: "#fca5a5",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 4,
  },
  successMessage: {
    color: "#86efac",
  },
  secondaryButton: {
    alignItems: "center",
    marginTop: 16,
  },
  secondaryText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "800",
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
