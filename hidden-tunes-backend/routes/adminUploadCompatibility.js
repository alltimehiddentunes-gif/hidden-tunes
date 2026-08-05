import crypto from "node:crypto";
import express from "express";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

import {
  adminCors,
  adminRateLimit,
  attachAdminRequestId,
  auditAdminSecurityEvent,
  requireAdminCatalogRole,
  requireAdminCatalogUploadEnabled,
} from "../services/adminCatalogSecurity.js";

const router = express.Router();
const jsonBody = express.json({ limit: "1mb" });
const ALLOWED_FOLDERS = new Set(["songs", "covers"]);
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const recentResults = new Map();

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function database() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function cleanName(value) {
  return String(value || "upload")
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "upload";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicBaseUrl() {
  return String(
    process.env.R2_PUBLIC_URL ||
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.PUBLIC_R2_BASE_URL ||
      ""
  ).replace(/\/+$/, "");
}

function secureChain() {
  return [
    adminCors,
    attachAdminRequestId,
    requireAdminCatalogRole,
    adminRateLimit,
    requireAdminCatalogUploadEnabled,
  ];
}

function safeFailure(req, res, status, error) {
  return res.status(status).json({
    success: false,
    error,
    requestId: req.adminRequestId,
  });
}

function audit(req, action, result, details = {}) {
  auditAdminSecurityEvent(req, action, result, {
    actorRole: req.adminActor?.role || null,
    ...details,
  });
}

function normalizedBody(body) {
  return {
    title: String(body.title || body.titleOverride || "").trim(),
    artist: String(body.artist || body.artistName || body.defaultArtist || "Hidden Tunes").trim(),
    album: String(body.album || body.albumTitle || body.defaultAlbum || "Singles").trim(),
    genre: String(body.genre || body.defaultGenre || "Uncategorized").trim(),
    mood: String(body.mood || body.defaultMood || "Unspecified").trim(),
    duration: Math.max(0, Math.round(Number(body.duration || body.durationSeconds || 0))),
    audioUrl: String(body.audioUrl || "").trim(),
    audioKey: String(body.audioKey || body.r2AudioKey || "").trim(),
    artworkUrl: String(body.artworkUrl || "").trim() || null,
    artworkKey: String(body.artworkKey || body.r2ArtworkKey || "").trim() || null,
    lyrics: String(body.plainLyricsText || "").trim() || null,
    syncedLyrics: String(body.syncedLrcText || body.lyricsText || "").trim() || null,
    explicit: typeof body.explicit === "boolean" ? body.explicit : null,
  };
}

function idempotencyKey(req, item) {
  const supplied = String(req.headers["idempotency-key"] || "").trim();
  if (supplied) return `header:${req.adminActor.id}:${supplied}`;
  return `audio:${req.adminActor.id}:${item.audioKey}`;
}

function remember(key, payload) {
  const now = Date.now();
  recentResults.set(key, { payload, expiresAt: now + IDEMPOTENCY_TTL_MS });
  for (const [candidate, value] of recentResults) {
    if (value.expiresAt <= now) recentResults.delete(candidate);
  }
}

async function ensureR2ObjectExists(client, key) {
  await client.send(new HeadObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }));
}

async function findOrCreateArtist(db, name, artworkUrl) {
  const slug = slugify(name) || "unknown-artist";
  const existing = await db.from("artists").select("*").eq("slug", slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { row: existing.data, state: "reused" };
  const created = await db.from("artists").insert({ name, slug, image_url: artworkUrl }).select("*").single();
  if (created.error) throw created.error;
  return { row: created.data, state: "created" };
}

async function findOrCreateAlbum(db, title, artistId, artworkUrl) {
  const slug = slugify(title) || "singles";
  const existing = await db.from("albums").select("*").eq("artist_id", artistId).eq("slug", slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { row: existing.data, state: "reused" };
  const created = await db.from("albums").insert({ title, slug, artist_id: artistId, artwork_url: artworkUrl }).select("*").single();
  if (created.error) throw created.error;
  return { row: created.data, state: "created" };
}

function isMissingOptionalExplicitColumn(error) {
  return (
    error?.code === "PGRST204" &&
    String(error?.message || "").includes("'explicit'")
  );
}

async function insertStagedSong(db, payload) {
  let result = await db.from("songs").insert(payload).select("*").single();
  if (
    result.error &&
    payload.explicit == null &&
    isMissingOptionalExplicitColumn(result.error)
  ) {
    const compatiblePayload = { ...payload };
    delete compatiblePayload.explicit;
    result = await db.from("songs").insert(compatiblePayload).select("*").single();
  }
  return result;
}

async function completeTrack(req, res) {
  const item = normalizedBody(req.body || {});
  if (!item.title || !item.audioUrl || !item.audioKey) {
    return safeFailure(req, res, 400, "Missing required song metadata or uploaded audio URL.");
  }
  if (!item.audioKey.startsWith("songs/") || (item.artworkKey && !item.artworkKey.startsWith("covers/"))) {
    return safeFailure(req, res, 400, "Uploaded object key is invalid.");
  }

  const key = idempotencyKey(req, item);
  const cached = recentResults.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    audit(req, "duplicate_detected", "reused", { songId: cached.payload.track.id });
    return res.json({ ...cached.payload, idempotent: true, requestId: req.adminRequestId });
  }

  const db = database();
  const objectStore = r2Client();
  audit(req, "upload_started", "accepted", { fileCount: 1 });

  try {
    await ensureR2ObjectExists(objectStore, item.audioKey);
    if (item.artworkKey) await ensureR2ObjectExists(objectStore, item.artworkKey);

    const existing = await db.from("songs").select("*").eq("r2_audio_key", item.audioKey).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const payload = { success: true, warning: "This uploaded object was already staged.", track: existing.data };
      remember(key, payload);
      audit(req, "duplicate_detected", "reused", { songId: existing.data.id });
      return res.json({ ...payload, idempotent: true, requestId: req.adminRequestId });
    }

    const artist = await findOrCreateArtist(db, item.artist, item.artworkUrl);
    const album = await findOrCreateAlbum(db, item.album, artist.row.id, item.artworkUrl);
    const songId = crypto.randomUUID();
    const songInsert = {
      id: songId,
      title: item.title,
      slug: `${slugify(item.artist)}-${slugify(item.title)}-${songId.slice(0, 8)}`,
      artist_id: artist.row.id,
      album_id: album.row.id,
      uploaded_by_user_id: req.adminActor.id,
      artist: artist.row.name,
      artist_name: artist.row.name,
      album: album.row.title,
      album_title: album.row.title,
      genre: item.genre,
      mood: item.mood,
      duration: item.duration,
      duration_seconds: item.duration,
      audio_url: item.audioUrl,
      url: item.audioUrl,
      artwork_url: item.artworkUrl,
      cover_url: item.artworkUrl,
      r2_audio_key: item.audioKey,
      r2_cover_key: item.artworkKey,
      source_name: "Hidden Tunes",
      source_type: "r2",
      type: "r2",
      is_online: true,
      is_public: false,
      explicit: item.explicit,
      lyrics: item.lyrics,
      synced_lyrics: item.syncedLyrics,
    };
    const inserted = await insertStagedSong(db, songInsert);
    if (inserted.error) throw inserted.error;

    const track = {
      ...inserted.data,
      artistId: inserted.data.artist_id,
      albumId: inserted.data.album_id,
      artwork: inserted.data.artwork_url,
      uploadedByUserId: inserted.data.uploaded_by_user_id,
      isOnline: inserted.data.is_online,
    };
    const payload = {
      success: true,
      warning: "Upload staged successfully. Classification review is required before publication.",
      staged: true,
      track,
    };
    remember(key, payload);
    audit(req, "item_staged", "success", {
      songId: track.id,
      artistId: artist.row.id,
      albumId: album.row.id,
      artistState: artist.state,
      albumState: album.state,
    });
    audit(req, "upload_completed", "success", { songId: track.id, fileCount: 1 });
    return res.json({ ...payload, requestId: req.adminRequestId });
  } catch (error) {
    audit(req, "upload_failed", "error");
    console.error("Catalogue compatibility upload failed", { requestId: req.adminRequestId, error });
    return safeFailure(req, res, 500, "Catalogue upload failed.");
  }
}

router.post("/api/upload-url", ...secureChain(), jsonBody, async (req, res) => {
  const fileName = cleanName(req.body?.fileName);
  const fileType = String(req.body?.fileType || "").trim();
  const folder = String(req.body?.folder || "").trim();
  if (!fileType || !ALLOWED_FOLDERS.has(folder)) {
    return safeFailure(req, res, 400, "Invalid upload request.");
  }
  const key = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
  try {
    const signedUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, ContentType: fileType }),
      { expiresIn: 600 }
    );
    audit(req, "signed_upload_created", "success", { objectKey: key });
    return res.json({
      success: true,
      signedUrl,
      key,
      bucket: process.env.R2_BUCKET_NAME,
      contentType: fileType,
      publicUrl: `${publicBaseUrl()}/${key}`,
      requestId: req.adminRequestId,
    });
  } catch (error) {
    console.error("Signed upload creation failed", { requestId: req.adminRequestId, error });
    return safeFailure(req, res, 500, "Could not prepare upload.");
  }
});

router.post("/api/admin/upload-file", ...secureChain(), (req, res) =>
  res.status(503).json({
    success: false,
    error: "Server upload fallback is temporarily unavailable. Retry the direct upload.",
    requestId: req.adminRequestId,
  })
);
router.post("/api/admin/upload-track", ...secureChain(), jsonBody, completeTrack);
router.post("/api/complete-song", ...secureChain(), jsonBody, completeTrack);

export {
  idempotencyKey,
  insertStagedSong,
  isMissingOptionalExplicitColumn,
  normalizedBody,
};
export default router;
