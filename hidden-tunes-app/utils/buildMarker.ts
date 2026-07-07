import Constants from "expo-constants";

import { HIDDEN_TUNES_API_BASE_URL } from "../services/hiddenTunesApi";

export type BuildMarkerInfo = {
  version: string;
  buildProfile: string;
  gitCommit: string;
  apiUrl: string;
};

export function getBuildMarkerInfo(): BuildMarkerInfo {
  const extra = Constants.expoConfig?.extra ?? {};

  return {
    version: Constants.expoConfig?.version ?? "?",
    buildProfile: String(
      extra.easBuildProfile ??
        process.env.EXPO_PUBLIC_BUILD_PROFILE ??
        "local"
    ),
    gitCommit: String(extra.gitCommit ?? "unknown"),
    apiUrl: HIDDEN_TUNES_API_BASE_URL,
  };
}
