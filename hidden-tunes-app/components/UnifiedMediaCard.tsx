import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS } from "../constants/theme";

type Props = {
  title: string;
  subtitle?: string;
  image?: any;
  imageUri?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  onRightPress?: () => void;
};

export default function UnifiedMediaCard({
  title,
  subtitle,
  image,
  imageUri,
  rightIcon = "ellipsis-horizontal",
  onPress,
  onRightPress,
}: Props) {
  const source = imageUri ? { uri: imageUri } : image;

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.wrap}>
      <LinearGradient colors={GRADIENTS.card} style={styles.card}>
        <View style={styles.imageWrap}>
          {source ? (
            <Image
              source={typeof source === "string" ? { uri: source } : source}
              style={styles.image}
            />
          ) : (
            <LinearGradient colors={GRADIENTS.soft} style={styles.fallback}>
              <Ionicons
                name="musical-notes"
                size={25}
                color={COLORS.primary}
              />
            </LinearGradient>
          )}
        </View>

        <View style={styles.textWrap}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>

          {!!subtitle && (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onRightPress}
          style={styles.iconButton}
        >
          <Ionicons name={rightIcon} size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },

  card: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  imageWrap: {
    width: 58,
    height: 58,
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },

  image: {
    width: "100%",
    height: "100%",
  },

  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  textWrap: {
    flex: 1,
    marginLeft: 13,
  },

  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
    fontWeight: "700",
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});