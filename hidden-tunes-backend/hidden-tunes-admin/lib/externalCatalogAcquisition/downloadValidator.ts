import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import type { ResolvedMedia } from "./sourceAdapter";
import { assertManagedStoragePath, resolveStoragePolicy } from "./storagePolicy";
import type { DownloadValidation, FingerprintResult, MediaFailureClass } from "./qualificationTypes";
type Options = { sourceItemId: string; resolveMedia: () => Promise<ResolvedMedia>; fingerprint?: (filePath: string) => Promise<FingerprintResult>; storageRoot?: string; fetchImpl?: typeof fetch; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> };
const MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/flac", "audio/ogg", "audio/opus", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/webm", "application/ogg", "application/octet-stream"]);
const CONTAINERS = new Set(["MPEG", "MP3", "FLAC", "Ogg", "WAVE", "WAV", "MP4", "WebM", "AAC", "ASF"]);
const mime = (value: string | null): string | null => value?.split(";", 1)[0]?.trim().toLowerCase() || null;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const dPath = (value: string): boolean => /^[dD]:[\\/]/.test(path.resolve(value));
const safeId = (value: string): string => { if (!/^\d+$/.test(value)) throw new Error("Dogmazic media validation requires a numeric source item ID."); return value; };
function classifyFailure(error: unknown, status: number | null): MediaFailureClass { const message=error instanceof Error?error.message:String(error); if(status===404)return "HTTP_NOT_FOUND"; if(status===403)return "HTTP_FORBIDDEN"; if(/redirect|Location header|escaped/i.test(message))return "REDIRECT_FAILURE"; if(/abort|timeout|timed out/i.test(message))return "TIMEOUT"; if(/MIME/i.test(message))return "INVALID_MIME"; if(/HTML|JSON error masquerading/i.test(message))return "HTML_RESPONSE"; if(/empty|zero-length/i.test(message))return "ZERO_LENGTH"; if(/API error 4704|Not Found/i.test(message))return "SOURCE_REMOVED"; if(/license URL is missing or unknown/i.test(message))return "API_METADATA_STALE"; if(/container|parse|decode|corrupt|Invalid audio|Invalid file|End-Of-Stream/i.test(message))return "CORRUPT_AUDIO"; return "OTHER"; }
function safeUrl(raw: string, expectedHost?: string): URL { const url = new URL(raw); if (url.protocol !== "https:" || (expectedHost && url.hostname.toLowerCase() !== expectedHost.toLowerCase())) throw new Error("Media redirect escaped the Dogmazic HTTPS host."); return url; }
export async function validateDogmazicDownload(options: Options): Promise<DownloadValidation> {
  const policy = resolveStoragePolicy({ EXTERNAL_CATALOG_STORAGE_ROOT: options.storageRoot || "D:\\HiddenTunes\\Data\\external-acquisition" });
  const stagingRoot = path.join(policy.root, "staging", "dogmazic");
  if (!dPath(stagingRoot)) throw new Error("Dogmazic media staging must be on D:.");
  await mkdir(stagingRoot, { recursive: true });
  const filePath = assertManagedStoragePath(path.join(stagingRoot, `${safeId(options.sourceItemId)}.download`), { ...policy, raw: stagingRoot, validated: stagingRoot, quarantine: stagingRoot, evidence: stagingRoot, fingerprints: stagingRoot, tmp: stagingRoot });
  const fetchImpl = options.fetchImpl || fetch;
  const maxBytes = options.maxBytes || 100 * 1024 * 1024;
  const timeoutMs = options.timeoutMs || 30_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxRetries = options.maxRetries ?? 2;
  let attempts = 0; let redirects = 0; const httpStatus: number | null = null; let fingerprint: FingerprintResult | undefined;
  try {
    const resolved = await options.resolveMedia();
    let url = safeUrl(resolved.mediaUrl);
    const expectedHost = url.hostname;
    for (let retry = 0; retry <= maxRetries; retry += 1) {
      attempts += 1;
      try {
        let response: Response;
        for (redirects = 0; redirects <= maxRedirects; redirects += 1) {
          response = await fetchImpl(url, { method: "GET", redirect: "manual", headers: { Accept: "audio/*" }, signal: AbortSignal.timeout(timeoutMs) });
          if (response.status < 300 || response.status >= 400) break;
          const location = response.headers.get("location");
          if (!location) throw new Error("Redirect response has no Location header.");
          url = safeUrl(new URL(location, url).toString(), expectedHost);
        }
        if (response!.status < 200 || response!.status >= 300) throw new Error(`Media endpoint returned HTTP ${response!.status}.`);
        const contentType = mime(response!.headers.get("content-type"));
        if (!contentType || !MIMES.has(contentType)) throw new Error(`Media endpoint returned unsupported MIME type: ${contentType || "missing"}.`);
        const advertised = Number(response!.headers.get("content-length") || "0");
        if (advertised > maxBytes) throw new Error(`Media exceeds maximum size of ${maxBytes} bytes.`);
        const bytes = new Uint8Array(await response!.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error("Media body is empty or exceeds the maximum size.");
        const prefix = Buffer.from(bytes.subarray(0, 256)).toString("utf8").trimStart().toLowerCase();
        if (prefix.startsWith("<!doctype html") || prefix.startsWith("<html") || prefix.startsWith("<head") || prefix.startsWith("{\"error")) throw new Error("HTML or JSON error masquerading as audio.");
        await writeFile(filePath, bytes);
        const parsed = await parseBuffer(Buffer.from(bytes), contentType, { duration: true });
        const format = parsed.format;
        fingerprint = options.fingerprint ? await options.fingerprint(filePath) : undefined;
        if (!format.container || !CONTAINERS.has(format.container)) throw new Error(`Unrecognized audio container: ${format.container || "missing"}.`);
        return { fingerprint, failureClass: null, status: "DOWNLOAD_PASS", attempts, httpStatus: response!.status, contentType, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), container: format.container, durationSeconds: Number.isFinite(format.duration) ? Number(format.duration) : null, codec: format.codec || null, bitrate: Number.isFinite(format.bitrate) ? Number(format.bitrate) : null, sampleRate: Number.isFinite(format.sampleRate) ? Number(format.sampleRate) : null, channels: format.numberOfChannels || null, redirects, error: null, temporaryPath: filePath };
      } catch (error) {
        if (retry === maxRetries) throw error;
        await (options.sleep || sleep)(500 * (2 ** retry));
      }
    }
    throw new Error("Media validation exhausted retries.");
  } catch (error) {
    return { fingerprint, failureClass: classifyFailure(error,httpStatus), status: "DOWNLOAD_FAIL", attempts, httpStatus, contentType: null, bytes: null, sha256: null, container: null, durationSeconds: null, codec: null, bitrate: null, sampleRate: null, channels: null, redirects, error: error instanceof Error ? error.message : String(error), temporaryPath: null };
  } finally { await rm(filePath, { force: true }).catch(() => undefined); }
}