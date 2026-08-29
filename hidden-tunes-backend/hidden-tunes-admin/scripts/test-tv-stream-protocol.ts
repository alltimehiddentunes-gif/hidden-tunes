import assert from "node:assert/strict";
import { probeDeepTvStream } from "../lib/tvStreamProtocol";

type Route = Response | (() => Response);

function mockFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const route = routes[url];
    if (!route) throw new Error(`Unexpected probe URL: ${url}`);
    return typeof route === "function" ? route() : route.clone();
  }) as typeof fetch;
}

function textResponse(body: string, contentType: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function mediaResponse(kind: "ts" | "mp4") {
  if (kind === "ts") {
    const bytes = new Uint8Array(188);
    bytes[0] = 0x47;
    return new Response(bytes.buffer, { headers: { "content-type": "video/mp2t" } });
  }
  const bytes = new TextEncoder().encode("\u0000\u0000\u0000\u0018ftypisom00000000");
  return new Response(bytes.buffer, { headers: { "content-type": "video/mp4" } });
}

async function main() {
  const hls = await probeDeepTvStream("https://stream.example/master.m3u8", {
    fetchImpl: mockFetch({
      "https://stream.example/master.m3u8": textResponse(
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900000\nhigh.m3u8",
        "application/vnd.apple.mpegurl"
      ),
      "https://stream.example/low.m3u8": textResponse(
        "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts",
        "application/vnd.apple.mpegurl"
      ),
      "https://stream.example/segment.ts": mediaResponse("ts"),
    }),
  });
  assert.equal(hls.playable, true);
  assert.equal(hls.outcome, "playable");
  assert.equal(hls.manifestValidated, true);
  assert.equal(hls.mediaValidated, true);

  const html200 = await probeDeepTvStream("https://stream.example/not-video", {
    fetchImpl: mockFetch({
      "https://stream.example/not-video": textResponse("<html>not media</html>", "text/html"),
    }),
  });
  assert.equal(html200.playable, false);
  assert.equal(html200.outcome, "unsupported");

  const drm = await probeDeepTvStream("https://stream.example/drm.m3u8", {
    fetchImpl: mockFetch({
      "https://stream.example/drm.m3u8": textResponse(
        '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="license"\n#EXTINF:6,\nsegment.ts',
        "application/vnd.apple.mpegurl"
      ),
    }),
  });
  assert.equal(drm.playable, false);
  assert.equal(drm.outcome, "drm");
  assert.equal(drm.drmDetected, true);

  const dashDrm = await probeDeepTvStream("https://stream.example/drm.mpd", {
    fetchImpl: mockFetch({
      "https://stream.example/drm.mpd": textResponse(
        '<MPD><Period><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" /></Period></MPD>',
        "application/dash+xml"
      ),
    }),
  });
  assert.equal(dashDrm.playable, false);
  assert.equal(dashDrm.outcome, "drm");

  const temporary = await probeDeepTvStream("https://stream.example/temp.m3u8?token=short", {
    fetchImpl: mockFetch({
      "https://stream.example/temp.m3u8?token=short": textResponse(
        "#EXTM3U\n#EXTINF:6,\nsegment.ts",
        "application/vnd.apple.mpegurl"
      ),
      "https://stream.example/segment.ts": mediaResponse("ts"),
    }),
  });
  assert.equal(temporary.playable, false);
  assert.equal(temporary.outcome, "temporary");
  assert.equal(temporary.stableUrl, null);
  assert.equal(temporary.mediaValidated, true);

  const longLivedButExpiring = await probeDeepTvStream(
    "https://stream.example/temp.m3u8?expires=4102444800",
    {
      fetchImpl: mockFetch({
        "https://stream.example/temp.m3u8?expires=4102444800": textResponse(
          "#EXTM3U\n#EXTINF:6,\nsegment.ts",
          "application/vnd.apple.mpegurl"
        ),
        "https://stream.example/segment.ts": mediaResponse("ts"),
      }),
    }
  );
  assert.equal(longLivedButExpiring.outcome, "temporary");
  assert.equal(longLivedButExpiring.stableUrl, null);

  const privateRedirect = await probeDeepTvStream("https://stream.example/redirect.m3u8", {
    fetchImpl: mockFetch({
      "https://stream.example/redirect.m3u8": new Response(null, {
        status: 302,
        headers: { location: "http://[::1]/private.m3u8" },
      }),
    }),
  });
  assert.equal(privateRedirect.playable, false);
  assert.equal(privateRedirect.reason, "private_url");

  const encrypted = await probeDeepTvStream("https://stream.example/aes.m3u8", {
    fetchImpl: mockFetch({
      "https://stream.example/aes.m3u8": textResponse(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment.m4s',
        "application/vnd.apple.mpegurl"
      ),
      "https://stream.example/key.bin": new Response(new Uint8Array(16).buffer),
      "https://stream.example/init.mp4": mediaResponse("mp4"),
      "https://stream.example/segment.m4s": mediaResponse("mp4"),
    }),
  });
  assert.equal(encrypted.playable, true);
  assert.equal(encrypted.keyValidated, true);
  assert.equal(encrypted.initSegmentValidated, true);

  console.log("tv stream protocol deep-probe tests passed");
}

void main();
