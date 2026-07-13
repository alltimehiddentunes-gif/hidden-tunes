import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type MusicQualityMode = "data_saver" | "automatic" | "high_quality" | "lossless";

type Rendition = Record<string, unknown>;
type AudioVersions = Record<string, Rendition | undefined>;

const QUALITY_ORDER = ["ultraLight", "standard", "highQuality", "lossless"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeMusicQualityMode(value: unknown): MusicQualityMode {
  const mode = String(value || "automatic").trim().toLowerCase();
  if (mode === "data_saver" || mode === "datasaver") return "data_saver";
  if (mode === "high" || mode === "high_quality") return "high_quality";
  if (mode === "lossless") return "lossless";
  return "automatic";
}

export function selectMusicRendition(value: unknown, requestedMode: unknown) {
  const versions = (asRecord(value) || {}) as AudioVersions;
  const mode = normalizeMusicQualityMode(requestedMode);
  const preferred: Record<MusicQualityMode, readonly string[]> = {
    data_saver: ["ultraLight", "standard"],
    automatic: ["standard", "ultraLight", "highQuality"],
    high_quality: ["highQuality", "standard", "ultraLight"],
    lossless: ["lossless", "highQuality", "standard", "ultraLight"],
  };

  for (const tier of preferred[mode]) {
    const snake = tier.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const rendition = asRecord(versions[tier] || versions[snake]);
    if (rendition) return { tier, rendition, mode };
  }

  for (const tier of QUALITY_ORDER) {
    const rendition = asRecord(versions[tier]);
    if (rendition) return { tier, rendition, mode };
  }

  return null;
}

export function isMusicPlaybackAuthorized(
  song: Record<string, unknown> | null,
  region: string,
  now = new Date()
) {
  if (!song || song.is_public === false) return false;
  const status = String(song.rights_status || "authorized").toLowerCase();
  if (!new Set(["authorized", "licensed", "owned"]).has(status)) return false;
  if (song.rights_expires_at && new Date(String(song.rights_expires_at)) <= now) return false;

  const regions = Array.isArray(song.rights_regions) ? song.rights_regions : ["*"];
  const normalizedRegion = region.trim().toUpperCase();
  return (
    !normalizedRegion ||
    regions.includes("*") ||
    regions.some((item) => String(item).toUpperCase() === normalizedRegion)
  );
}

export function getMusicRenditionStorageKey(rendition: Rendition | null) {
  return String(rendition?.r2Key || rendition?.r2_key || "").trim();
}

function getR2Client() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 signing credentials are incomplete.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function signMusicRendition(storageKey: string, expiresIn = 900) {
  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket || !storageKey) throw new Error("R2 bucket and storage key are required.");
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: bucket, Key: storageKey.replace(/^\/+/, "") }),
    { expiresIn: Math.max(60, Math.min(expiresIn, 3600)) }
  );
}
