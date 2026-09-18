import express from "express";
import { playbackStore } from "../services/junction2/playbackStore.js";
import { isAllowedUpstreamArtworkHost, fallbackCoverUrl } from "../services/junction2/metadata/artwork.js";

const MAX_BYTES = 2_500_000;
const MAX_REDIRECTS = 3;

function abortFrom(res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

async function fetchAllowedImage(url, signal) {
  let current = String(url || "");
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:") return null;
    if (!isAllowedUpstreamArtworkHost(parsed.host)) return null;
    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { accept: "image/*,*/*;q=0.8" },
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      const loc = upstream.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, parsed).toString();
      continue;
    }
    if (!upstream.ok || !upstream.body) return null;
    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) return null;
    const length = Number(upstream.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > MAX_BYTES) return null;
    return upstream;
  }
  return null;
}

export function createArtworkRouter(deps = {}) {
  const router = express.Router();

  router.get("/:playbackId", async (req, res) => {
    const store = deps.store || playbackStore;
    const record = store.get(req.params.playbackId);
    const signal = abortFrom(res);

    const tryUrls = [];
    if (record?.albumArtworkUrl) tryUrls.push(record.albumArtworkUrl);
    if (record?.mediaThumbnailUrl) tryUrls.push(record.mediaThumbnailUrl);
    if (
      String(record?.provider || "").toLowerCase() === "youtube" &&
      /^[a-zA-Z0-9_-]{6,32}$/.test(String(record?.sourceId || ""))
    ) {
      tryUrls.push(`https://i.ytimg.com/vi/${record.sourceId}/hqdefault.jpg`);
    }

    for (const url of tryUrls) {
      try {
        const upstream = await fetchAllowedImage(url, signal);
        if (!upstream) continue;
        res.status(200);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
        let sent = 0;
        const reader = upstream.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          sent += value.byteLength;
          if (sent > MAX_BYTES) {
            res.destroy();
            return;
          }
          if (!res.write(Buffer.from(value))) {
            await new Promise((resolve) => res.once("drain", () => resolve()));
          }
        }
        res.end();
        return;
      } catch {
        if (signal.aborted) return;
      }
    }

    const fallback = fallbackCoverUrl();
    try {
      const upstream = await fetchAllowedImage(fallback, signal);
      if (upstream) {
        res.status(200);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=3600");
        const reader = upstream.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise((resolve) => res.once("drain", () => resolve()));
          }
        }
        res.end();
        return;
      }
    } catch {
      /* fall through */
    }
    if (!res.headersSent) res.status(404).end();
  });

  return router;
}

export default createArtworkRouter();
