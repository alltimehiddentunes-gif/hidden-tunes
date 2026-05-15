import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;
let cachedClientKey = "";

export function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucketName = process.env.R2_BUCKET_NAME?.trim() || "";
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() || "";

  const missingVariables = [
    !accountId ? "R2_ACCOUNT_ID" : null,
    !accessKeyId ? "R2_ACCESS_KEY_ID" : null,
    !secretAccessKey ? "R2_SECRET_ACCESS_KEY" : null,
    !bucketName ? "R2_BUCKET_NAME" : null,
    !publicBaseUrl ? "R2_PUBLIC_BASE_URL" : null,
  ].filter(Boolean) as string[];

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    missingVariables,
  };
}

export function getR2Client() {
  const {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    missingVariables,
  } = getR2Config();

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing R2 environment variables: ${missingVariables.join(", ")}`
    );
  }

  const clientKey = [
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
  ].join(":");

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },

      // Important for Cloudflare R2 compatibility
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    cachedClientKey = clientKey;
  }

  return cachedClient;
}

export const r2 = new Proxy({} as S3Client, {
  get(_target, property) {
    const client = getR2Client() as unknown as Record<string | symbol, unknown>;
    const value = client[property];

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  },
});

export async function uploadToR2({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  const { bucketName, publicBaseUrl } = getR2Config();

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `${publicBaseUrl}/${key}`;
}
