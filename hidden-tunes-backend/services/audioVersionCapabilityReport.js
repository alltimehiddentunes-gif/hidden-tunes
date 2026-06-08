import { detectTranscodeCapabilities } from "./audioVersionGeneration.js";

function listMissingEnvVars(names) {
  return names.filter((name) => !String(process.env[name] || "").trim());
}

function getSupabaseEnvStatus() {
  const missing = listMissingEnvVars([
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  return {
    ok: missing.length === 0,
    missing,
  };
}

function getR2EnvStatus() {
  const missing = listMissingEnvVars([
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ]);

  const publicUrlCandidates = [
    "R2_PUBLIC_URL",
    "R2_PUBLIC_BASE_URL",
    "PUBLIC_R2_BASE_URL",
  ];
  const publicUrlMissing = listMissingEnvVars(publicUrlCandidates);

  return {
    ok: missing.length === 0 && publicUrlMissing.length < publicUrlCandidates.length,
    missing,
    publicUrlConfigured: publicUrlMissing.length < publicUrlCandidates.length,
    publicUrlMissing,
  };
}

export async function getAudioVersionCapabilityReport() {
  const capabilities = await detectTranscodeCapabilities();
  const supabase = getSupabaseEnvStatus();
  const r2 = getR2EnvStatus();

  const ready =
    capabilities.ffmpegAvailable &&
    capabilities.ffprobeAvailable &&
    capabilities.tempWritable &&
    supabase.ok &&
    r2.ok;

  return {
    success: ready,
    mode: "manual-only",
    capabilities,
    env: {
      supabase,
      r2,
    },
    warnings: [
      !capabilities.ffmpegAvailable ? "ffmpeg is not available" : null,
      !capabilities.ffprobeAvailable ? "ffprobe is not available" : null,
      !capabilities.tempWritable ? "temp directory is not writable" : null,
      !supabase.ok
        ? `Missing Supabase env: ${supabase.missing.join(", ")}`
        : null,
      !r2.ok ? `Missing R2 env: ${r2.missing.join(", ")}` : null,
      !r2.publicUrlConfigured
        ? "No R2 public base URL env configured (R2_PUBLIC_URL / R2_PUBLIC_BASE_URL / PUBLIC_R2_BASE_URL)"
        : null,
    ].filter(Boolean),
  };
}
