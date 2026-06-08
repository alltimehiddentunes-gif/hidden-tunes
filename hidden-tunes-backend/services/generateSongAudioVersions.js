import fs from "fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  detectTranscodeCapabilities,
  generateAudioVersionsFromMaster,
} from "./audioVersionGeneration.js";
import {
  buildAudioVersionStatusResponse,
  evaluateAudioVersionGenerationLock,
  isMissingAudioVersionColumnError,
  normalizeAudioVersionStatus,
} from "./audioVersionStatus.js";
import { downloadMasterFromR2 } from "./r2Download.js";

const LOG_PREFIX = "[ht-generate-audio-versions]";

export const SONG_AUDIO_VERSION_SELECT = `
  id,
  title,
  slug,
  artist,
  artist_name,
  album,
  album_title,
  audio_url,
  url,
  r2_audio_key,
  audio_versions,
  audio_version_status,
  audio_version_generated_at,
  audio_version_error,
  artists (
    slug
  ),
  albums (
    slug
  )
`;

let cachedUploadClient = null;

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDefaultUploadToR2() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(process.env.R2_BUCKET_NAME || "").trim();
  const publicBaseUrl = String(
    process.env.R2_PUBLIC_URL ||
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.PUBLIC_R2_BASE_URL ||
      ""
  )
    .replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    throw new Error("Missing R2 environment variables for tier upload.");
  }

  if (!cachedUploadClient) {
    cachedUploadClient = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return async function uploadToR2({ key, body, contentType }) {
    await cachedUploadClient.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return `${publicBaseUrl}/${key}`;
  };
}

function resolveSongSlugs(song) {
  const artistName = song.artist_name || song.artist || "unknown-artist";
  const albumTitle = song.album_title || song.album || "singles";
  const artistSlug =
    song.artists?.slug || slugify(artistName) || "unknown-artist";
  const albumSlug = song.albums?.slug || slugify(albumTitle) || "singles";
  const songSlug = song.slug || slugify(`${artistName}-${song.title}`) || "untitled-song";

  return { artistSlug, albumSlug, songSlug, artistName, albumTitle };
}

function listAvailableTiers(audioVersions) {
  const record = audioVersions && typeof audioVersions === "object" ? audioVersions : {};

  return {
    ultraLight: Boolean(record.ultraLight || record.ultra_light),
    standard: Boolean(record.standard),
    highQuality: Boolean(record.highQuality || record.high_quality),
    lossless: Boolean(record.lossless),
  };
}

export async function loadSongForAudioVersionGeneration(supabase, songId) {
  const { data, error } = await supabase
    .from("songs")
    .select(SONG_AUDIO_VERSION_SELECT)
    .eq("id", songId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function buildSongAudioVersionStatusPayload(song, capabilities = null) {
  const caps = capabilities || (await detectTranscodeCapabilities());
  const statusFields = buildAudioVersionStatusResponse(song);
  const tiers = listAvailableTiers(song?.audio_versions);

  return {
    songId: song?.id || null,
    ...statusFields,
    hasAudioVersions: Boolean(tiers.ultraLight && tiers.standard),
    tiers,
    capabilities: caps,
    masterR2Key: song?.r2_audio_key || null,
    audioUrl: song?.audio_url || song?.url || null,
  };
}

async function updateSongAudioVersionState(supabase, songId, patch) {
  const { data, error } = await supabase
    .from("songs")
    .update(patch)
    .eq("id", songId)
    .select(SONG_AUDIO_VERSION_SELECT)
    .maybeSingle();

  if (error && isMissingAudioVersionColumnError(error)) {
    const legacyPatch = { ...patch };
    delete legacyPatch.audio_versions;
    delete legacyPatch.audio_version_status;
    delete legacyPatch.audio_version_error;
    delete legacyPatch.audio_version_generated_at;

    if (Object.keys(legacyPatch).length === 0) {
      throw new Error(
        "Audio version status columns are missing. Apply the 35E-5A migration before generating tiers."
      );
    }

    const legacyResult = await supabase
      .from("songs")
      .update(legacyPatch)
      .eq("id", songId)
      .select(SONG_AUDIO_VERSION_SELECT)
      .maybeSingle();

    if (legacyResult.error) throw legacyResult.error;

    return {
      song: legacyResult.data,
      migrationWarning:
        "Audio version status columns are missing. Song playback fields were preserved, but tier metadata was not stored.",
    };
  }

  if (error) throw error;

  return { song: data, migrationWarning: null };
}

async function claimProcessingLock(supabase, songId) {
  const { data, error } = await supabase
    .from("songs")
    .update({
      audio_version_status: "processing",
      audio_version_error: null,
    })
    .eq("id", songId)
    .neq("audio_version_status", "processing")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

/**
 * Generate ultraLight + standard tiers for one song on demand.
 */
export async function generateSongAudioVersions({
  supabase,
  songId,
  force = false,
  uploadToR2 = null,
  log = console,
} = {}) {
  if (!supabase) {
    throw new Error("Supabase client is required.");
  }

  if (!songId) {
    return {
      success: false,
      httpStatus: 400,
      error: "Song id is required.",
    };
  }

  const song = await loadSongForAudioVersionGeneration(supabase, songId);

  if (!song) {
    return {
      success: false,
      httpStatus: 404,
      error: "Song not found.",
    };
  }

  const lock = evaluateAudioVersionGenerationLock({
    status: song.audio_version_status,
    force,
  });

  if (!lock.allowed && lock.action === "reject") {
    return {
      success: false,
      httpStatus: 409,
      error: lock.message,
      reason: lock.reason,
      songId,
      audio_version_status: normalizeAudioVersionStatus(song.audio_version_status),
    };
  }

  if (!lock.allowed && lock.action === "noop") {
    const statusPayload = await buildSongAudioVersionStatusPayload(song);
    return {
      success: true,
      httpStatus: 200,
      action: "noop",
      reason: lock.reason,
      message: lock.message,
      ...statusPayload,
    };
  }

  const masterKey = String(song.r2_audio_key || "").trim();

  if (!masterKey) {
    const message =
      "Cannot generate audio versions without songs.r2_audio_key. Legacy audio_url is unchanged.";

    const { song: updatedSong } = await updateSongAudioVersionState(supabase, songId, {
      audio_version_status: "skipped",
      audio_version_error: message,
    });

    return {
      success: false,
      httpStatus: 422,
      action: "skipped",
      reason: "missing_master_key",
      error: message,
      ...(await buildSongAudioVersionStatusPayload(updatedSong)),
    };
  }

  const claimed = await claimProcessingLock(supabase, songId);

  if (!claimed) {
    return {
      success: false,
      httpStatus: 409,
      error: "Audio version generation is already in progress for this song.",
      reason: "already_processing",
      songId,
      audio_version_status: "processing",
    };
  }

  const resolvedUploadToR2 = uploadToR2 || getDefaultUploadToR2();
  const { artistSlug, albumSlug, songSlug } = resolveSongSlugs(song);
  let download = null;

  try {
    download = await downloadMasterFromR2({
      r2Key: masterKey,
      masterFileName: pathBasename(masterKey),
      log,
    });

    const masterBuffer = await fs.readFile(download.localPath);

    const generation = await generateAudioVersionsFromMaster({
      masterBuffer,
      masterFileName: pathBasename(masterKey),
      songId,
      artistSlug,
      albumSlug,
      songSlug,
      uploadToR2: resolvedUploadToR2,
      log,
    });

    if (generation.skipped) {
      const message =
        generation.reason === "ffmpeg_unavailable"
          ? "ffmpeg or ffprobe is unavailable in this environment. Legacy audio_url is unchanged."
          : generation.reason === "temp_not_writable"
            ? "Temp directory is not writable. Legacy audio_url is unchanged."
            : generation.reason === "transcode_failed"
              ? `Audio version generation failed: ${generation.error || "transcode error"}`
              : "Audio version generation was skipped. Legacy audio_url is unchanged.";

      const terminalStatus =
        generation.reason === "transcode_failed" ? "failed" : "skipped";

      const { song: updatedSong } = await updateSongAudioVersionState(supabase, songId, {
        audio_version_status: terminalStatus,
        audio_version_error: message,
      });

      logWarn(log, "generation skipped or failed", {
        songId,
        reason: generation.reason,
        terminalStatus,
      });

      return {
        success: false,
        httpStatus: terminalStatus === "failed" ? 500 : 503,
        action: terminalStatus,
        reason: generation.reason,
        error: message,
        capabilities: generation.capabilities,
        ...(await buildSongAudioVersionStatusPayload(updatedSong, generation.capabilities)),
      };
    }

    const generatedAt = new Date().toISOString();
    const updatePatch = {
      audio_versions: generation.audioVersions,
      audio_version_status: "ready",
      audio_version_generated_at: generatedAt,
      audio_version_error: null,
      audio_url: generation.standardUrl || song.audio_url,
      url: generation.standardUrl || song.url || song.audio_url,
    };

    const { song: updatedSong, migrationWarning } = await updateSongAudioVersionState(
      supabase,
      songId,
      updatePatch
    );

    logInfo(log, "generation succeeded", {
      songId,
      standardKey: generation.standardKey,
      ultraLightKey: generation.ultraLightKey,
    });

    const statusPayload = await buildSongAudioVersionStatusPayload(
      updatedSong,
      generation.capabilities
    );

    return {
      success: true,
      httpStatus: 200,
      action: "generated",
      message: "Audio versions generated successfully.",
      warning: migrationWarning,
      standardUrl: generation.standardUrl,
      ultraLightUrl: generation.ultraLightUrl,
      ...statusPayload,
      ...(updatedSong?.audio_versions
        ? { audio_versions: updatedSong.audio_versions }
        : {}),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio version generation failed.";

    let updatedSong = song;

    try {
      const result = await updateSongAudioVersionState(supabase, songId, {
        audio_version_status: "failed",
        audio_version_error: message,
      });
      updatedSong = result.song || song;
    } catch (updateError) {
      logWarn(log, "failed to persist failure status", {
        songId,
        error:
          updateError instanceof Error ? updateError.message : String(updateError),
      });
    }

    logWarn(log, "generation failed", { songId, error: message });

    return {
      success: false,
      httpStatus: 500,
      action: "failed",
      error: message,
      ...(await buildSongAudioVersionStatusPayload(updatedSong)),
    };
  } finally {
    if (download) {
      await download.cleanup().catch(() => {});
    }
  }
}

export async function getSongAudioVersionStatus({ supabase, songId, log = console } = {}) {
  if (!supabase) {
    throw new Error("Supabase client is required.");
  }

  if (!songId) {
    return {
      success: false,
      httpStatus: 400,
      error: "Song id is required.",
    };
  }

  const song = await loadSongForAudioVersionGeneration(supabase, songId);

  if (!song) {
    return {
      success: false,
      httpStatus: 404,
      error: "Song not found.",
    };
  }

  const capabilities = await detectTranscodeCapabilities();
  logInfo(log, "status requested", { songId, capabilities });

  return {
    success: true,
    httpStatus: 200,
    ...(await buildSongAudioVersionStatusPayload(song, capabilities)),
  };
}

function pathBasename(value) {
  const parts = String(value || "").split("/");
  return parts[parts.length - 1] || "master.audio";
}
