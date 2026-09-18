import express from "express";
import { playbackStore } from "../services/junction2/playbackStore.js";
import { isAllowedUpstreamArtworkHost, fallbackCoverUrl } from "../services/junction2/metadata/artwork.js";

function abortFrom(res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

async function fetchAllowedImage(url, signal) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") return null;
  if (!isAllowedUpstreamArtworkHost(parsed.host)) return null;
  const upstream = await fetch(parsed.toString(), {
    method: "GET",
    redirect: "error",
    signal,
    headers: { accept: "image/*,*/*;q=0.8" },
  });
  if (!upstream.ok || !upstream.body) return null;
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/")) return null;
  return upstream;
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

    for (const url of tryUrls) {
      try {
        const upstream = await fetchAllowedImage(url, signal);
        if (!upstream) continue;
        res.status(200);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("X-Content-Type-Options", "nosniff");
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
      } catch {
        if (signal.aborted) return;
      }
    }

    // Controlled fallback redirect only to allowlisted HT fallback host.
    const fallback = fallbackCoverUrl();
    try {
      const upstream = await fetchAllowedImage(fallback, signal);
      if (upstream) {
        res.status(200);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=300");
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
