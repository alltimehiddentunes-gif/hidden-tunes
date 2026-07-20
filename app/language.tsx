import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { safeRouterBack } from "../utils/safeNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppShell from "../components/navigation/AppShell";
import { getMobileScrollTailPadding } from "../components/navigation/navigationConfig";
import { COLORS, GRADIENTS } from "../constants/theme";
import { useLocalization } from "../localization";
import { PRODUCTION_LOCALES, getLocaleNativeName, type SupportedLocale } from "../localization";

export default function LanguageScreen() {
  const insets = useSafeAreaInsets();
  const { locale, isChangingLanguage, setLocale, t } = useLocalization();
  const scrollTailPadding = useMemo(
    () => getMobileScrollTailPadding(insets.bottom),
    [insets.bottom]
  );

  const handleSelect = useCallback(
    (code: SupportedLocale) => {
      if (code === locale || isChangingLanguage) return;
      void setLocale(code);
    },
    [isChangingLanguage, locale, setLocale]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={() => safeRouterBack("/library")}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{t("language.title")}</Text>
            <Text style={styles.subtitle}>{t("language.subtitle")}</Text>
          </View>
        </View>

        {isChangingLanguage ? (
          <View style={styles.changingRow}>
            <ActivityIndicator color={COLORS.primary} size="small" />
            <Text style={styles.changingText}>{t("settings.changingLanguage")}</Text>
          </View>
        ) : null}

        <FlatList
          data={PRODUCTION_LOCALES}
          keyExtractor={(item) => item.code}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: scrollTailPadding },
          ]}
          renderItem={({ item }) => {
            const selected = item.code === locale;
            return (
              <TouchableOpacity
                activeOpacity={0.84}
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => handleSelect(item.code)}
                disabled={isChangingLanguage}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={getLocaleNativeName(item.code)}
              >
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>{item.nativeName}</Text>
                  {selected ? (
                    <Text style={styles.rowSubtitle}>{t("language.current")}</Text>
                  ) : null}
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={COLORS.textMuted} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  changingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  changingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  rowSelected: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderColor: "rgba(168,85,247,0.28)",
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  rowSubtitle: {
    color: COLORS.primary,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
});
