import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

const LOG_PREFIX = "[ht-audio-versions]";

function logInfo(log, message, details) {
  if (details !== undefined) {
    log.info(`${LOG_PREFIX} ${message}`, details);
  } else {
    log.info(`${LOG_PREFIX} ${message}`);
  }
}

function logWarn(log, message, details) {
  if (details !== undefined) {
    log.warn(`${LOG_PREFIX} ${message}`, details);
  } else {
    log.warn(`${LOG_PREFIX} ${message}`);
  }
}

/**
 * Detect ffmpeg/ffprobe availability and whether the OS temp directory is writable.
 * Never throws — callers use this to decide whether transcoding is possible.
 */
export async function detectTranscodeCapabilities() {
  const tempDir = os.tmpdir();
  let tempWritable = false;

  try {
    const probePath = path.join(tempDir, `ht-cap-${randomUUID()}.tmp`);
    await fs.writeFile(probePath, "ok");
    await fs.unlink(probePath);
    tempWritable = true;
  } catch {
    tempWritable = false;
  }

  let ffmpegAvailable = false;
  let ffprobeAvailable = false;

  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }

  try {
    await execFileAsync("ffprobe", ["-version"], { timeout: 5000 });
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
  }

  return {
    ffmpegAvailable,
    ffprobeAvailable,
    tempWritable,
    tempDir,
  };
}

function slugifyPathSegment(value) {
  return (
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

/**
 * Plan R2 object keys and target encode settings for ultraLight + standard tiers.
 */
export function planAudioVersionsForUpload({
  masterFile = null,
  songId = null,
  artistSlug,
  albumSlug,
  songSlug,
}) {
  const artist = slugifyPathSegment(artistSlug);
  const album = slugifyPathSegment(albumSlug);
  const song = slugifyPathSegment(songSlug);
  const base = `songs/${artist}/${album}/${song}`;

  return {
    songId,
    masterFile,
    tiers: {
      ultraLight: {
        r2Key: `${base}/ultra-light.m4a`,
        fileName: "ultra-light.m4a",
        codec: "aac",
        bitrateKbps: 64,
        offlineEligible: true,
      },
      standard: {
        r2Key: `${base}/standard.m4a`,
        fileName: "standard.m4a",
        codec: "aac",
        bitrateKbps: 160,
        offlineEligible: false,
      },
    },
  };
}

async function transcodeToAac(inputPath, outputPath, bitrateKbps) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "aac",
      "-b:a",
      `${bitrateKbps}k`,
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: 300000 }
  );
}

async function probeDurationSeconds(inputPath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    { timeout: 30000 }
  );

  const parsed = Number.parseFloat(String(stdout || "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/**
 * Build songs.audio_versions JSON for storage (camelCase tiers).
 */
export function buildAudioVersionsRecord({
  ultraLightUrl,
  ultraLightKey,
  ultraLightSizeBytes,
  standardUrl,
  standardKey,
  standardSizeBytes,
  durationSeconds,
  plan,
}) {
  const ultraLightTier = plan?.tiers?.ultraLight;
  const standardTier = plan?.tiers?.standard;

  if (!ultraLightUrl || !standardUrl || !ultraLightTier || !standardTier) {
    return null;
  }

  const record = {
    ultraLight: {
      url: ultraLightUrl,
      r2Key: ultraLightKey,
      codec: ultraLightTier.codec,
      bitrateKbps: ultraLightTier.bitrateKbps,
      fileSizeBytes: ultraLightSizeBytes,
      offlineEligible: ultraLightTier.offlineEligible,
    },
    standard: {
      url: standardUrl,
      r2Key: standardKey,
      codec: standardTier.codec,
      bitrateKbps: standardTier.bitrateKbps,
      fileSizeBytes: standardSizeBytes,
      offlineEligible: standardTier.offlineEligible,
    },
  };

  if (durationSeconds != null) {
    record.ultraLight.durationSeconds = durationSeconds;
    record.standard.durationSeconds = durationSeconds;
  }

  return record;
}

/**
 * Transcode a master buffer into ultraLight + standard tiers and upload to R2.
 * Skips gracefully when ffmpeg/ffprobe/temp are unavailable or transcoding fails.
 */
export async function generateAudioVersionsFromMaster({
  masterBuffer,
  masterFileName = "master.audio",
  songId,
  artistSlug,
  albumSlug,
  songSlug,
  uploadToR2,
  log = console,
}) {
  const capabilities = await detectTranscodeCapabilities();
  logInfo(log, "transcode capability status", capabilities);

  const plan = planAudioVersionsForUpload({
    masterFile: masterFileName,
    songId,
    artistSlug,
    albumSlug,
    songSlug,
  });

  if (!capabilities.ffmpegAvailable || !capabilities.ffprobeAvailable) {
    logWarn(
      log,
      "ffmpeg or ffprobe unavailable — skipping tier generation; legacy upload path preserved"
    );
    return {
      audioVersions: null,
      standardUrl: null,
      standardKey: null,
      ultraLightUrl: null,
      ultraLightKey: null,
      skipped: true,
      reason: "ffmpeg_unavailable",
      capabilities,
      plan,
    };
  }

  if (!capabilities.tempWritable) {
    logWarn(
      log,
      "temp directory is not writable — skipping tier generation; legacy upload path preserved"
    );
    return {
      audioVersions: null,
      standardUrl: null,
      standardKey: null,
      ultraLightUrl: null,
      ultraLightKey: null,
      skipped: true,
      reason: "temp_not_writable",
      capabilities,
      plan,
    };
  }

  if (!masterBuffer || !Buffer.isBuffer(masterBuffer) || masterBuffer.length === 0) {
    logWarn(log, "missing master buffer — skipping tier generation");
    return {
      audioVersions: null,
      standardUrl: null,
      standardKey: null,
      ultraLightUrl: null,
      ultraLightKey: null,
      skipped: true,
      reason: "missing_master_buffer",
      capabilities,
      plan,
    };
  }

  const workId = randomUUID();
  const workDir = path.join(capabilities.tempDir, `ht-av-${workId}`);
  const ext = path.extname(masterFileName || "") || ".audio";
  const inputPath = path.join(workDir, `master${ext}`);
  const ultraPath = path.join(workDir, "ultra-light.m4a");
  const standardPath = path.join(workDir, "standard.m4a");

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(inputPath, masterBuffer);

    await transcodeToAac(
      inputPath,
      ultraPath,
      plan.tiers.ultraLight.bitrateKbps
    );
    await transcodeToAac(
      inputPath,
      standardPath,
      plan.tiers.standard.bitrateKbps
    );

    const [ultraStat, standardStat] = await Promise.all([
      fs.stat(ultraPath),
      fs.stat(standardPath),
    ]);

    const durationSeconds = await probeDurationSeconds(standardPath);

    const [ultraBuffer, standardBuffer] = await Promise.all([
      fs.readFile(ultraPath),
      fs.readFile(standardPath),
    ]);

    const [ultraLightUrl, standardUrl] = await Promise.all([
      uploadToR2({
        key: plan.tiers.ultraLight.r2Key,
        body: ultraBuffer,
        contentType: "audio/mp4",
      }),
      uploadToR2({
        key: plan.tiers.standard.r2Key,
        body: standardBuffer,
        contentType: "audio/mp4",
      }),
    ]);

    const audioVersions = buildAudioVersionsRecord({
      ultraLightUrl,
      ultraLightKey: plan.tiers.ultraLight.r2Key,
      ultraLightSizeBytes: ultraStat.size,
      standardUrl,
      standardKey: plan.tiers.standard.r2Key,
      standardSizeBytes: standardStat.size,
      durationSeconds,
      plan,
    });

    logInfo(log, "tier generation succeeded", {
      ultraLightKey: plan.tiers.ultraLight.r2Key,
      standardKey: plan.tiers.standard.r2Key,
      durationSeconds,
    });

    return {
      audioVersions,
      standardUrl,
      standardKey: plan.tiers.standard.r2Key,
      ultraLightUrl,
      ultraLightKey: plan.tiers.ultraLight.r2Key,
      skipped: false,
      capabilities,
      plan,
    };
  } catch (error) {
    logWarn(log, "tier generation failed — legacy upload path preserved", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      audioVersions: null,
      standardUrl: null,
      standardKey: null,
      ultraLightUrl: null,
      ultraLightKey: null,
      skipped: true,
      reason: "transcode_failed",
      error: error instanceof Error ? error.message : String(error),
      capabilities,
      plan,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
