import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../constants/theme";
import type { MoodRoomGradient } from "../../utils/moodRooms";
import HTImage from "../HTImage";

export type MoodRoomCardProps = {
  title: string;
  subtitle: string;
  artwork?: string;
  gradient: MoodRoomGradient;
  active?: boolean;
  onPress: () => void;
};

const MoodRoomCard = memo(function MoodRoomCard({
  title,
  subtitle,
  artwork,
  gradient,
  active,
  onPress,
}: MoodRoomCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, active && styles.cardActive]}
      activeOpacity={0.88}
      onPress={onPress}
    >
      <View style={styles.artWrap}>
        {artwork ? (
          <HTImage uri={artwork} style={styles.art} />
        ) : (
          <LinearGradient colors={gradient} style={styles.art}>
            <Ionicons name="sparkles" size={22} color={COLORS.textMuted} />
          </LinearGradient>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.72)"]}
          style={styles.artOverlay}
        />
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default MoodRoomCard;

const styles = StyleSheet.create({
  card: {
    width: 156,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardActive: {
    borderColor: "rgba(168,85,247,0.5)",
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  artWrap: {
    width: "100%",
    height: 92,
    backgroundColor: COLORS.card,
  },
  art: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  artOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  copy: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
});
