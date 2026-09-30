/** Only explicitly qualified installed native builds share this operational profile. */
export const IOS_216_POLICY_TARGET = Object.freeze({ platform: "ios", nativeBuild: "1.0.216", bundleId: "com.hiddentunes.app", profile: "IOS_216" } as const);
export type IosOperationalIdentity = { platform: string; nativeBuild: string | null; bundleId: string | null; profile: "IOS_216" | "IOS_LEGACY" };
const qualifiedNativeBuilds = new Set(["1.0.216", "1.0.217"]);

export function isIosCurrentNativeIdentity(value: unknown): value is IosOperationalIdentity {
  const identity = value as Partial<IosOperationalIdentity> | null;
  return !!identity && identity.platform === "ios" && typeof identity.nativeBuild === "string" &&
    qualifiedNativeBuilds.has(identity.nativeBuild) && identity.bundleId === "com.hiddentunes.app" && identity.profile === "IOS_216";
}

export function isIos216PolicyTarget(value: unknown): value is typeof IOS_216_POLICY_TARGET {
  const target = value as Partial<IosOperationalIdentity> | null;
  return !!target && target.platform === "ios" && target.nativeBuild === "1.0.216" && target.bundleId === "com.hiddentunes.app" && target.profile === "IOS_216";
}

/** Read only raw native constants: OTA expoConfig/manifest overrides are deliberately excluded. */
export function installedIosOperationalIdentity(platform: string, nativeConstants: unknown): IosOperationalIdentity {
  const native = nativeConstants as { platform?: { ios?: { buildNumber?: unknown } }; manifest?: unknown; executionEnvironment?: unknown } | null;
  let nativeBuild: string | null = null, bundleId: string | null = null;
  if (platform === "ios" && native && native.executionEnvironment !== "storeClient") {
    nativeBuild = typeof native.platform?.ios?.buildNumber === "string" ? native.platform.ios.buildNumber : null;
    try {
      const embedded = (typeof native.manifest === "string" ? JSON.parse(native.manifest) : native.manifest) as { ios?: { bundleIdentifier?: unknown } } | null;
      bundleId = typeof embedded?.ios?.bundleIdentifier === "string" ? embedded.ios.bundleIdentifier : null;
    } catch { /* Missing/malformed native identity stays legacy; never inspect OTA config. */ }
  }
  const profile = platform === "ios" && nativeBuild !== null && qualifiedNativeBuilds.has(nativeBuild) && bundleId === "com.hiddentunes.app" ? "IOS_216" : "IOS_LEGACY";
  return Object.freeze({ platform, nativeBuild, bundleId, profile });
}

export function ios216RequestHeaders(identity: unknown): Record<string, string> {
  return isIosCurrentNativeIdentity(identity) ? {
    "x-ht-platform": "ios",
    "x-ht-native-build": identity.nativeBuild!,
    "x-ht-bundle-id": "com.hiddentunes.app",
    "x-ht-policy-profile": "IOS_216",
  } : {};
}
