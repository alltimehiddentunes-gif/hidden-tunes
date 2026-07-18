import { DeviceEventEmitter, Platform, ToastAndroid } from "react-native";

export const RADIO_PLAYBACK_MESSAGE_EVENT = "hidden-tunes:radio-playback-message";

export function notifyRadioPlaybackMessage(message: string) {
  const text = String(message || "").trim();
  if (!text) return;

  if (Platform.OS === "android") {
    try {
      ToastAndroid.show(text, ToastAndroid.SHORT);
    } catch {
      // Fall through to event bus for any UI listeners.
    }
  }

  DeviceEventEmitter.emit(RADIO_PLAYBACK_MESSAGE_EVENT, text);
}
