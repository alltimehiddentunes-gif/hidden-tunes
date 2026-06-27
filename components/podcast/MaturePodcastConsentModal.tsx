import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";

type MaturePodcastConsentModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function MaturePodcastConsentModal({
  visible,
  onCancel,
  onConfirm,
}: MaturePodcastConsentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>Mature Podcasts 18+</Text>
          <Text style={styles.message}>
            I confirm that I am 18 or older and understand this section may contain explicit or
            adult podcast content.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={onConfirm}>
              <Text style={styles.confirmText}>I am 18+ and continue</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 22,
    backgroundColor: "#120818",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  message: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cancelText: {
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  confirmButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(168,85,247,0.28)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.45)",
  },
  confirmText: {
    color: COLORS.text,
    fontWeight: "800",
  },
});
