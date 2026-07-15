import { AUDIOBOOK_PLAYABILITY_MAX_REDIRECTS, AUDIOBOOK_PLAYABILITY_TIMEOUT_MS } from "@/lib/audiobookExpansionConstants";

const AUDIO_EXTENSIONS = /\.(mp3|m4a|ogg|opus|flac|wav)(\?|$)/i;

const HTML_SIGNATURE = /^\s*<!doctype html|^\s*<html/i;

export type AudiobookPlayabilityResult = {
  ok: boolean;
  reason?: string;
  mimeType?: string | null;
  contentLength?: number | null;
  durationHint?: number | null;
};

function inferMimeType(url: string, headerMime: string | null) {
  if (headerMime && headerMime.startsWith("audio/")) return headerMime;
  const lowered = url.toLowerCase();
  if (lowered.endsWith(".ogg")) return "audio/ogg";
  if (lowered.endsWith(".m4a")) return "audio/mp4";
  if (lowered.endsWith(".opus")) return "audio/opus";
  return "audio/mpeg";
}

export async function probeAudiobookChapterUrl(
  url: string,
  signal?: AbortSignal
): Promise<AudiobookPlayabilityResult> {
  const normalized = String(url || "").trim();
  if (!normalized.startsWith("https://")) {
    return { ok: false, reason: "non_https_url" };
  }

  if (!AUDIO_EXTENSIONS.test(normalized) && !normalized.includes("archive.org/download/")) {
    return { ok: false, reason: "unsupported_extension" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUDIOBOOK_PLAYABILITY_TIMEOUT_MS);
  const mergedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    let currentUrl = normalized;
    let redirects = 0;

    while (redirects <= AUDIOBOOK_PLAYABILITY_MAX_REDIRECTS) {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: mergedSignal,
        headers: { "User-Agent": "HiddenTunes-Audiobook-Probe/1.0" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, reason: "redirect_without_location" };
        currentUrl = new URL(location, currentUrl).toString();
        redirects += 1;
        continue;
      }

      if (!response.ok) {
        return { ok: false, reason: `http_${response.status}` };
      }

      const contentType = response.headers.get("content-type");
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentType && contentType.includes("text/html")) {
        return { ok: false, reason: "html_response" };
      }
      if (contentLength > 0 && contentLength < 1024) {
        return { ok: false, reason: "zero_or_tiny_file" };
      }

      const mimeType = inferMimeType(currentUrl, contentType);
      return {
        ok: true,
        mimeType,
        contentLength: contentLength > 0 ? contentLength : null,
      };
    }

    return { ok: false, reason: "too_many_redirects" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe_failed";
    return { ok: false, reason: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyAudiobookEditionSampleChapters(
  chapterUrls: string[],
  signal?: AbortSignal
) {
  if (chapterUrls.length === 0) {
    return { ok: false, reason: "no_chapters", verified: 0, failed: 0 };
  }

  const indices = new Set<number>([0]);
  if (chapterUrls.length > 2) indices.add(Math.floor(chapterUrls.length / 2));
  if (chapterUrls.length > 1) indices.add(chapterUrls.length - 1);

  let verified = 0;
  let failed = 0;
  const reasons: string[] = [];

  for (const index of [...indices].sort((a, b) => a - b)) {
    const result = await probeAudiobookChapterUrl(chapterUrls[index], signal);
    if (result.ok) verified += 1;
    else {
      failed += 1;
      if (result.reason) reasons.push(result.reason);
    }
  }

  return {
    ok: verified > 0 && failed === 0,
    reason: reasons[0],
    verified,
    failed,
  };
}

export function isLikelyHtmlAudioPayload(bufferPreview: string) {
  return HTML_SIGNATURE.test(bufferPreview);
}
