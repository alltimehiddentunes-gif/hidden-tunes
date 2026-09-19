import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type AutomotiveSafetyState = {
  isAutomotive: boolean;
  videoAllowed: boolean;
  audioWhileDrivingAllowed: boolean;
  reason: string;
};

const BLOCKED: AutomotiveSafetyState = {
  isAutomotive: false,
  videoAllowed: false,
  audioWhileDrivingAllowed: false,
  reason: "unsupported_or_unavailable",
};

const nativeModule = NativeModules.HiddenTunesAutomotiveSafety;

export function isAutomotiveParkedVideoBuild() {
  return Platform.OS === "android" && Boolean(nativeModule);
}

export async function getAutomotiveSafetyState(): Promise<AutomotiveSafetyState> {
  if (!isAutomotiveParkedVideoBuild()) return BLOCKED;
  try {
    const state = await nativeModule.getSafetyState();
    return {
      isAutomotive: state?.isAutomotive === true,
      videoAllowed: state?.isAutomotive === true && state?.videoAllowed === true,
      audioWhileDrivingAllowed: false,
      reason: String(state?.reason || "unknown"),
    };
  } catch {
    return BLOCKED;
  }
}

export function subscribeAutomotiveSafety(
  listener: (state: AutomotiveSafetyState) => void
) {
  if (!isAutomotiveParkedVideoBuild()) return () => {};
  const emitter = new NativeEventEmitter(nativeModule);
  const subscription = emitter.addListener(
    "hiddenTunesAutomotiveSafetyChanged",
    (state) => {
      listener({
        isAutomotive: state?.isAutomotive === true,
        videoAllowed: state?.isAutomotive === true && state?.videoAllowed === true,
        audioWhileDrivingAllowed: false,
        reason: String(state?.reason || "unknown"),
      });
    }
  );
  return () => subscription.remove();
}
