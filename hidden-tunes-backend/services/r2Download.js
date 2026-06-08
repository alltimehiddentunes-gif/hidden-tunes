import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const LOG_PREFIX = "[ht-r2-download]";

let cachedClient = null;
let cachedClientKey = "";

function logInfo(log, message, details) {
  if (details !== undefined) {
    log.info(`${LOG_PREFIX} ${message}`, details);
  } else {
    log.info(`${LOG_PREFIX} ${message}`);
  }
}

function getR2Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(process.env.R2_BUCKET_NAME || "").trim();
  const publicBaseUrl = String(
    process.env.R2_PUBLIC_URL ||
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.PUBLIC_R2_BASE_URL ||
      ""
  ).trim();

  const missing = [
    !accountId ? "R2_ACCOUNT_ID" : null,
    !accessKeyId ? "R2_ACCESS_KEY_ID" : null,
    !secretAccessKey ? "R2_SECRET_ACCESS_KEY" : null,
    !bucketName ? "R2_BUCKET_NAME" : null,
  ].filter(Boolean);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    missing,
  };
}

function getR2Client() {
  const config = getR2Config();

  if (config.missing.length > 0) {
    throw new Error(
      `Missing R2 environment variables: ${config.missing.join(", ")}`
    );
  }

  const clientKey = [
    config.accountId,
    config.accessKeyId,
    config.secretAccessKey,
    config.bucketName,
  ].join(":");

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedClientKey = clientKey;
  }

  return cachedClient;
}

function cleanR2Key(key) {
  return String(key || "")
    .trim()
    .replace(/^\/+/, "");
}

function isNotFoundError(error) {
  const status = error?.$metadata?.httpStatusCode;
  const code = String(error?.name || error?.Code || "").toLowerCase();
  return status === 404 || code === "notfound" || code === "nosuchkey";
}

async function writeObjectBodyToFile(body, localPath) {
  if (!body) {
    throw new Error("R2 object body was empty.");
  }

  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    await fs.writeFile(localPath, bytes);
    return;
  }

  await pipeline(body, createWriteStream(localPath));
}

/**
 * Download a master/original object from R2 to a local temp file.
 * Caller must invoke cleanup() when finished.
 */
export async function downloadMasterFromR2({
  r2Key,
  masterFileName = null,
  log = console,
}) {
  const key = cleanR2Key(r2Key);

  if (!key) {
    throw new Error("R2 key is required to download master audio.");
  }

  const config = getR2Config();
  const client = getR2Client();
  const downloadStartedAt = Date.now();

  let head;

  try {
    head = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error(`R2 master object not found: ${key}`);
    }

    throw error;
  }

  const fileSizeBytes = Number(head.ContentLength || 0);

  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    throw new Error(`R2 master object is empty: ${key}`);
  }

  const workId = randomUUID();
  const workDir = path.join(os.tmpdir(), `ht-master-${workId}`);
  const ext = path.extname(masterFileName || key) || ".audio";
  const localPath = path.join(workDir, `master${ext}`);

  await fs.mkdir(workDir, { recursive: true });

  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );

    await writeObjectBodyToFile(object.Body, localPath);

    const downloadDurationMs = Date.now() - downloadStartedAt;

    logInfo(log, "master download completed", {
      r2Key: key,
      fileSizeBytes,
      downloadDurationMs,
      localPath,
    });

    return {
      localPath,
      workDir,
      r2Key: key,
      fileSizeBytes,
      downloadDurationMs,
      contentType: object.ContentType || head.ContentType || "application/octet-stream",
      async cleanup() {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Download master audio, run async work, then always cleanup temp files.
 */
export async function withDownloadedMasterFromR2(options, workFn) {
  const download = await downloadMasterFromR2(options);

  try {
    return await workFn(download);
  } finally {
    await download.cleanup();
  }
}
