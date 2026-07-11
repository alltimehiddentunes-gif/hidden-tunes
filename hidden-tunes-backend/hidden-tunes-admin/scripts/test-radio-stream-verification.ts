import assert from "node:assert/strict";

import {
  applyRadioVerificationProbe,
  isPublicRadioEligible,
  probeRadioStream,
  validatePublicRadioStreamUrl,
} from "../lib/radioStreamVerification";
import { isPublicRadioRow, toRadioPublicStation } from "../lib/radioPublicCatalog";

const originalFetch = globalThis.fetch;

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

function installFetch(
  handler: (url: string) => Response | Promise<Response>
) {
  globalThis.fetch = ((input: string | URL | Request) =>
    handler(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)) as typeof fetch;
}

async function main() {
  assert.equal(validatePublicRadioStreamUrl("https://audio.example.com/live.mp3").ok, true);
  assert.equal(validatePublicRadioStreamUrl("http://localhost/live.mp3").ok, false);
  assert.equal(validatePublicRadioStreamUrl("http://192.168.1.2/live.mp3").ok, false);
  assert.equal(validatePublicRadioStreamUrl("file:///tmp/live.mp3").ok, false);

  installFetch(() =>
    response("ID3 audio bytes", {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    })
  );
  const mp3 = await probeRadioStream("https://audio.example.com/live.mp3");
  assert.equal(mp3.playable, true);
  assert.equal(mp3.outcome, "playable");
  assert.ok(mp3.bytesRead > 0);

  installFetch((url) => {
    if (url.includes("playlist.m3u")) {
      return response("#EXTM3U\nhttps://audio.example.com/live.aac\n", {
        status: 200,
        headers: { "content-type": "audio/x-mpegurl" },
      });
    }
    return response("ADTS", {
      status: 200,
      headers: { "content-type": "audio/aac" },
    });
  });
  const playlist = await probeRadioStream("https://audio.example.com/playlist.m3u");
  assert.equal(playlist.playable, true);
  assert.equal(playlist.playlistResolved, true);

  installFetch((url) => {
    if (url.includes("redirect")) {
      return response("", {
        status: 302,
        headers: { location: "https://audio.example.com/target.ogg" },
      });
    }
    return response("OggS", {
      status: 200,
      headers: { "content-type": "application/ogg" },
    });
  });
  const redirect = await probeRadioStream("https://audio.example.com/redirect");
  assert.equal(redirect.playable, true);
  assert.equal(redirect.redirects, 1);

  installFetch(() =>
    response("<html>nope</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })
  );
  const html = await probeRadioStream("https://audio.example.com/page");
  assert.equal(html.playable, false);
  assert.equal(html.outcome, "html_response");

  installFetch(() => response("missing", { status: 404 }));
  const missing = await probeRadioStream("https://audio.example.com/missing");
  assert.equal(missing.playable, false);
  assert.equal(missing.retryable, false);

  installFetch(() => response("temporary", { status: 503 }));
  const temporary = await probeRadioStream("https://audio.example.com/down");
  assert.equal(temporary.playable, false);
  assert.equal(temporary.retryable, true);

  installFetch(() =>
    response("not audio", {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  const unsupported = await probeRadioStream("https://audio.example.com/data.json");
  assert.equal(unsupported.playable, false);
  assert.equal(unsupported.outcome, "unsupported_content");

  const baseRow = {
    id: "radio-1",
    status: "approved",
    is_active: true,
    is_mature: false,
    playback_status: "unchecked",
    reliability_score: 40,
    consecutive_failures: 0,
    quarantined_at: null,
    disabled_at: null,
  };
  const successUpdate = applyRadioVerificationProbe(baseRow, mp3, "2026-07-11T00:00:00.000Z");
  assert.equal(successUpdate.playback_status, "playable");
  assert.equal(successUpdate.is_verified, true);
  assert.equal(successUpdate.quarantined_at, null);

  const failUpdate = applyRadioVerificationProbe(baseRow, html, "2026-07-11T00:00:00.000Z");
  assert.equal(failUpdate.playback_status, "failed");
  assert.equal(failUpdate.is_verified, false);
  assert.equal(failUpdate.quarantined_at, "2026-07-11T00:00:00.000Z");

  assert.equal(
    isPublicRadioEligible({
      ...baseRow,
      playback_status: "playable",
      is_verified: true,
      reliability_score: 80,
    }),
    true
  );
  assert.equal(
    isPublicRadioEligible({
      ...baseRow,
      playback_status: "playable",
      is_verified: true,
      is_mature: true,
      reliability_score: 80,
    }),
    false
  );
  assert.equal(
    isPublicRadioRow({
      ...baseRow,
      playback_status: "playable",
      is_verified: true,
      is_mature: true,
      reliability_score: 80,
    }),
    false
  );

  const publicStation = toRadioPublicStation({
    id: "radio-1",
    name: "Radio One",
    favicon_url: "https://img.example.com/logo.png",
    tags: ["jazz"],
    categories: ["music"],
    votes: 10,
    click_count: 20,
    reliability_score: 80,
    stream_url: "https://audio.example.com/live.mp3",
  });
  assert.equal("stream_url" in publicStation, false);
  assert.equal("audioUrl" in publicStation, false);
  assert.equal("playbackUrl" in publicStation, false);

  globalThis.fetch = originalFetch;
  console.log("radio stream verification tests passed");
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  throw error;
});
