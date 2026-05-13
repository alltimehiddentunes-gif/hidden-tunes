import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

import { COLORS } from "../constants/theme";
import { PlaylistTrack } from "../services/playlistEngine";
import AddToPlaylistModal from "./AddToPlaylistModal";

type Props = {
  track: PlaylistTrack | any;
  size?: number;
  color?: string;
};

export default function AddToPlaylistButton({
  track,
  size = 23,
  color = COLORS.text,
}: Props) {
  const [visible, setVisible] = useState(false);

  const openModal = () => {
    if (!track) return;
    setVisible(true);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.82}
        style={styles.button}
        onPress={openModal}
        hitSlop={8}
      >
        <Ionicons name="add-circle-outline" size={size} color={color} />
      </TouchableOpacity>

      <AddToPlaylistModal
        visible={visible}
        track={track}
        onClose={() => setVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
});