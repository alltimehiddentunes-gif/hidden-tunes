import Constants, { ExecutionEnvironment } from "expo-constants";
import { NativeModules, Platform } from "react-native";

/** Expo runtime detection (Android + iOS). */

/** True in the public Expo Go app on Android or iPhone. */
export function isExpoGo(): boolean {
  if (Constants.appOwnership === "expo") {
    return true;
  }

  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** True in a custom Development Client build (EAS developmentClient profile). */
export function isDevelopmentClient(): boolean {
  if (isExpoGo()) {
    return false;
  }

  const nativeModules = NativeModules as Record<string, unknown>;

  return Boolean(nativeModules.EXDevLauncher || nativeModules.EXDevMenu);
}

/** Native modules from custom dev/release builds (both platforms). */
export function supportsNativeModules(): boolean {
  return !isExpoGo();
}

export function getExpoRuntimeLabel():
  | "expo-go"
  | "development-client"
  | "standalone" {
  if (isExpoGo()) return "expo-go";
  if (isDevelopmentClient()) return "development-client";
  return "standalone";
}

export function getPlatformRuntimeLabel(): string {
  return Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : Platform.OS;
}